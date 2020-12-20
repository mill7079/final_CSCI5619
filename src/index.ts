/* CSCI 5619 Final, Fall 2020
 * Authors: Angel Sylvester and Allison Miller
 * */ 

import { Engine } from "@babylonjs/core/Engines/engine"; 
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3, Color4 } from "@babylonjs/core/Maths/math";
import { StandardMaterial } from "@babylonjs/core/Materials/standardMaterial";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { WebXRControllerComponent } from "@babylonjs/core/XR/motionController/webXRControllercomponent";
import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
import { WebXRCamera } from "@babylonjs/core/XR/webXRCamera";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
import { HemisphericLight } from "@babylonjs/core/Lights/hemisphericLight";
import { Logger } from "@babylonjs/core/Misc/logger";
import { MeshBuilder } from "@babylonjs/core/Meshes/meshBuilder";
import { AbstractMesh } from "@babylonjs/core/Meshes/abstractMesh";
import { AdvancedDynamicTexture } from "@babylonjs/gui/2D/advancedDynamicTexture";
import { InputPassword, InputText, VirtualKeyboard, TextBlock, ColorPicker, StackPanel, Button } from "@babylonjs/gui/2D/controls";
import { SceneSerializer } from "@babylonjs/core/Misc/sceneSerializer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Animation } from "@babylonjs/core/Animations/animation";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";
import { Ray } from "@babylonjs/core/Culling/ray";
import { Axis } from "@babylonjs/core/Maths/math.axis";
import { Quaternion } from "@babylonjs/core/Maths/math.vector";
import { TransformNode } from "@babylonjs/core/Meshes/transformNode";
import { AssetsManager, MeshAssetTask } from "@babylonjs/core/Misc/assetsManager";
import { Texture } from "@babylonjs/core/Materials/Textures/texture";

import * as MATRIX from "matrix-js-sdk";

// Side effects
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/inspector";
import "@babylonjs/loaders";

// handle message sending, given a JSON string representation
module Messages {
    export var client = MATRIX.createClient("https://matrix.org");
    export var room = "!FQlzwKdCBFuEnQusdk:matrix.org";

    export function sendMessage(isNotice: boolean, content: string) {
        console.log("send message");
        let send = {
            body: content,
            msgtype: isNotice ? "m.notice" : "m.text"
        };

        client.sendEvent(room, "m.room.message", send, "", (err: any, res: any) => {
            if (err) {
                console.log("message send error: " + err);
            }
        });
    }
}

enum MessageType {
    user,
    item,
    sync,
    remove
}

class Game 
{ 
    private canvas: HTMLCanvasElement;
    private engine: Engine;
    private scene: Scene;

    private xrCamera: WebXRCamera | null; 
    private leftController: WebXRInputSource | null;
    private rightController: WebXRInputSource | null;
    private leftHand: AbstractMesh;
    private rightHand: AbstractMesh;
    private selectedObject: AbstractMesh | null;
    private minMove = 0.22;  // activation distance of widgets
    
    private client: any;
    private user = "";
    private room = Messages.room;

    private guiPlane: AbstractMesh | null;
    private loginStatus: AbstractMesh | null;
    private syncStatus: AbstractMesh | null;
    
    private black = "#070707";
    private gray = "#707070";

    private envUsers: Map<string, User>;
    private envObjects: Map<string, AbstractMesh>;
    private userColor: Color3;
    private isUpdateComplete: Boolean | null;
    private tutorialStatus: AbstractMesh | null;

    private failedLogin: TextBlock | null;

    private admin = true;
    private frame = 0; 
    private movementArray: Array<Vector3>;
    private rotationArray: Vector3[];

    // in-environment GUI items
    private destroyWidget: AbstractMesh;
    //private colorWidget: AbstractMesh;
    private textureWidget: AbstractMesh;
    private currentWidget: AbstractMesh | null;
    private widgetPos: Vector3 | null;
    //private colorPicker: AbstractMesh;
    private textureNode: TransformNode;

    // custom teleportation/selection
    private laserPointer: LinesMesh | null;
    private groundMeshes: Array<AbstractMesh>;
    private teleportPoint: Vector3 | null;
    private teleportImage: Mesh;
    private rotationNode: TransformNode;
    private headsetRotation: Quaternion | null;
    private trackControllers: Vector3 | null = null;

    constructor()
    {
        // Get the canvas element 
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

        // Generate the BABYLON 3D engine
        this.engine = new Engine(this.canvas, true); 

        // Creates a basic Babylon Scene object
        this.scene = new Scene(this.engine);   

        // general functionality
        this.xrCamera = null;
        this.leftController = null;
        this.rightController = null;
        this.leftHand = MeshBuilder.CreateSphere("leftHand", { segments: 16, diameter: 0.1 }, this.scene);
        this.rightHand = MeshBuilder.CreateSphere("rightHand", { segments: 16, diameter: 0.1 }, this.scene);
        this.leftHand.isPickable = false;
        this.leftHand.isVisible = false;
        this.rightHand.isPickable = false;
        this.rightHand.isVisible = false;
        this.selectedObject = null;

        // used for animation
        this.isUpdateComplete = true;

        // create client on server
        this.client = Messages.client;

        // admin GUI things
        this.guiPlane = null;
        this.loginStatus = null;
        this.failedLogin = null;
        this.syncStatus = null;
        this.tutorialStatus = null; 

        // synced environment
        this.envUsers = new Map();
        this.envObjects = new Map();
        this.userColor = new Color3(Math.random(), Math.random(), Math.random());

        // track selected object motion
        this.frame = 0;
        this.movementArray = [];
        this.rotationArray = [];

        // grab this to destroy the selected object
        this.destroyWidget = MeshBuilder.CreateSphere("destroyWidget", { segments: 4, diameter: 0.05 }, this.scene);
        this.destroyWidget.material = new StandardMaterial("destroyMaterial", this.scene);
        (<StandardMaterial>this.destroyWidget.material).diffuseColor = new Color3(0.5, 0, 0);
        this.destroyWidget.isPickable = false;
        this.destroyWidget.isVisible = false;

        // grab this to change color of selected object
        //this.colorWidget = MeshBuilder.CreateCylinder("colorWidget", { height: 0.05, diameter: 0.05 }, this.scene);
        //this.colorWidget.material = new StandardMaterial("colorMaterial", this.scene);
        //(<StandardMaterial>this.colorWidget.material).diffuseColor = new Color3(0, 0.5, 0);
        //this.colorWidget.isPickable = false;
        //this.colorWidget.isVisible = false;

        //this.colorPicker = MeshBuilder.CreatePlane("colorPlane", {}, this.scene);
        //var colorTexture = AdvancedDynamicTexture.CreateForMesh(this.colorPicker, 512, 512);
        //var color = new ColorPicker("colorPicker");
        //colorTexture.addControl(color);
        ////this.colorPicker.isVisible = false;
        //color.onValueChangedObservable.add((color) => {
        //    (<StandardMaterial>this.selectedObject?.material).diffuseColor.copyFrom(color);
        //});

        // grab this to change texture of selected object
        this.textureWidget = MeshBuilder.CreateBox("textureWidget", { size: 0.05 }, this.scene);
        this.textureWidget.material = new StandardMaterial("textureWidget", this.scene);
        (<StandardMaterial>this.textureWidget.material).diffuseColor = new Color3(0, 0, 0.5);
        this.textureWidget.isPickable = false;
        this.textureWidget.isVisible = false;

        this.textureNode = new TransformNode("textureNode", this.scene);

        var textures: Texture[] = [];
        textures.push(new Texture("assets/textures/purple.jpg", this.scene));
        textures.push(new Texture("assets/textures/flowers.jpg", this.scene));
        textures.push(new Texture("assets/textures/metal.jpg", this.scene));
        textures.push(new Texture("assets/textures/rainbow.jpg", this.scene));
        textures.push(new Texture("assets/textures/paint.jpg", this.scene));

        for (let i = 0; i < textures.length; i++) {
            let angle = (i *  2 * Math.PI) / textures.length;
            let tex = textures[i];
            let texBox = MeshBuilder.CreateBox("tex" + i, { size: 0.06 }, this.scene);
            let texMat = new StandardMaterial("texMat" + i, this.scene);
            texMat.diffuseTexture = tex;
            texBox.material = texMat;
            texBox.isVisible = false;
            texBox.isPickable = false;

            texBox.position = new Vector3(Math.sin(angle) / 5, 0, Math.cos(angle) / 5);
            texBox.parent = this.textureNode;
        }

        //var tex1 = MeshBuilder.CreateBox("tex1", { size: 0.06 }, this.scene);
        //var t1 = new Texture("assets/textures/purple.jpg", this.scene);
        //var t1mat = new StandardMaterial("tex1Mat", this.scene);
        //t1mat.diffuseTexture = t1;
        //tex1.material = t1mat;
        //tex1.position = new Vector3(0, 0.2, 0);
        //tex1.isVisible = false;
        //tex1.parent = this.textureNode;
        //tex1.isPickable = false;

        // widget handling
        this.currentWidget = null;
        this.widgetPos = null;

        // teleportation handling
        this.laserPointer = null;
        this.groundMeshes = [];
        this.teleportPoint = null;

        this.teleportImage = MeshBuilder.CreateCylinder("teleportImage", { height: 0.3, diameterTop: 0.2, diameterBottom: 0 }, this.scene);
        var material = new StandardMaterial("imageMat", this.scene);
        material.emissiveColor = new Color3(0, 0.3, 0);
        this.teleportImage.material = material;
        this.teleportImage.isVisible = false;
        this.teleportImage.isPickable = false;

        this.rotationNode = new TransformNode("rotationNode", this.scene);
        this.headsetRotation = null;
    }

    start() : void 
    {
        // Create the scene and then execute this function afterwards
        this.createScene().then(() => {

            // Register a render loop to repeatedly render the scene
            this.engine.runRenderLoop(() => { 
                this.update();
                this.scene.render();
            });

            // Watch for browser/canvas resize events
            window.addEventListener("resize", () => { 
                this.engine.resize();
            });

        });
    }

    private async createScene() 
    {
        // This creates and positions a first-person camera (non-mesh)
        var camera = new UniversalCamera("camera1", new Vector3(0, 1.6, 0), this.scene);
        camera.fov = 90 * Math.PI / 180;
        camera.minZ = .1;
        camera.maxZ = 100;

        // This attaches the camera to the canvas
        camera.attachControl(this.canvas, true);

       // Create a point light
        var pointLight = new PointLight("pointLight", new Vector3(0, 2.5, 0), this.scene);
        pointLight.intensity = 1.0;
        pointLight.diffuse = new Color3(.25, .25, .25);

        var ambient = new HemisphericLight("ambientLight", new Vector3(0, 1, 0), this.scene);
        ambient.intensity = 0.7;
        ambient.diffuse = new Color3(0.3, 0.3, 0.25);

        // Creates a default skybox
        const environment = this.scene.createDefaultEnvironment({
            createGround: true,
            groundSize: 100,
            skyboxSize: 50,
            skyboxColor: new Color3(0, 0, 0)
        });

        // Make sure the skybox is not pickable!
        //environment!.ground!.isPickable = false;
        environment!.skybox!.isPickable = false;

        // Creates the XR experience helper
        const xrHelper = await this.scene.createDefaultXRExperienceAsync({});

        // Assigns the web XR camera to a member variable
        this.xrCamera = xrHelper.baseExperience.camera;

        // Remove default teleportation
        xrHelper.teleportation.dispose();
        //xrHelper.teleportation.addFloorMesh(environment!.ground!);
        this.groundMeshes.push(environment!.ground!);

        // Create points for the laser pointer
        var laserPoints = [];
        laserPoints.push(new Vector3(0, 0, 0));
        laserPoints.push(new Vector3(0, 0, 1));

        // create laser pointer
        this.laserPointer = MeshBuilder.CreateLines("laserPointer", { points: laserPoints }, this.scene);
        this.laserPointer.color = Color3.White();
        this.laserPointer.alpha = .5;
        this.laserPointer.visibility = 0;
        this.laserPointer.isPickable = false;

        // Assign the left and right controllers to member variables
        xrHelper.input.onControllerAddedObservable.add((inputSource) => {
            inputSource.onMeshLoadedObservable.add((mesh) => {
                if (mesh.name != "leftHand" && mesh.name != "rightHand") {
                    mesh.dispose();
                }
            });
            if(inputSource.uniqueId.endsWith("right"))
            {
                this.rightController = inputSource;
                this.rightHand.parent = this.rightController.grip!;
                this.rightHand.isVisible = true;

                //this.destroyWidget.parent = this.rightController.pointer;
                //this.destroyWidget.position = new Vector3(0, -0.06, -0.11);

                //this.colorWidget.parent = this.rightController.pointer;
                //this.colorWidget.position = new Vector3(-0.06, 0.04, -0.11);

                this.textureWidget.parent = this.rightController.pointer;
                this.textureWidget.position = new Vector3(-0.06, 0.04, -0.11);

                //this.textureWidget.parent = this.rightController.pointer;
                //this.textureWidget.position = new Vector3(0.06, 0.04, -0.11);

                this.destroyWidget.parent = this.rightController.pointer;
                this.destroyWidget.position = new Vector3(0.06, 0.04, -0.11);

                this.laserPointer!.parent = this.rightController.pointer;
            }
            else 
            {
                this.leftController = inputSource;
                this.leftHand.parent = this.leftController.grip!;
                this.leftHand.isVisible = true;

                this.rotationNode.parent = this.leftController.pointer;

                //this.colorPicker.position = this.leftHand.absolutePosition.clone();
                //this.colorPicker.position.x += 0.3;
            }

            //Messages.sendMessage(false, this.createUpdate(this.user));
            //Messages.sendMessage(false, this.createMessage(MessageType.user, this.user));
        });

        // Don't forget to deparent objects from the controllers or they will be destroyed!
        xrHelper.input.onControllerRemovedObservable.add((inputSource) => {

            if (inputSource.uniqueId.endsWith("right")) {
                this.rightHand.parent = null;
                this.rightHand.isVisible = false;

                this.laserPointer!.parent = null;
                this.laserPointer!.visibility = 0;
            } else {
                this.leftHand.parent = null;
                this.leftHand.isVisible = false;

                this.rotationNode.parent = null;
            }

            if (!this.rightHand.isVisible && !this.leftHand.isVisible) {
                Messages.sendMessage(false, this.createMessage(MessageType.remove, this.user));
                this.client.logout();
                this.client.stopClient();
            }
        });

        
        // create login gui
        this.guiPlane = MeshBuilder.CreatePlane("guiPlane", {}, this.scene);
        this.guiPlane.position = new Vector3(0, 1, 1);

        var guiTexture = AdvancedDynamicTexture.CreateForMesh(this.guiPlane, 1024, 1024);
        var inputUser = new InputText("inputUser");
        inputUser.top = -320;
        inputUser.width = 1;
        inputUser.height = "80px";
        inputUser.fontSize = 36;
        inputUser.color = "white";
        inputUser.background = this.black;
        guiTexture.addControl(inputUser);
        
        var inputPass = new InputPassword("inputPass");
        inputPass.top = -240;
        inputPass.width = 1;
        inputPass.height = "80px";
        inputPass.fontSize = 36;
        inputPass.color = "white";
        inputPass.background = this.gray;
        guiTexture.addControl(inputPass);

        // login status page for visual feedback
        this.loginStatus = MeshBuilder.CreatePlane("loginStatus", {}, this.scene);
        this.loginStatus.position = this.guiPlane.position.clone();
        this.loginStatus.isPickable = false;
        this.loginStatus.isVisible = false;

        var loginMesh = AdvancedDynamicTexture.CreateForMesh(this.loginStatus, 512, 512);
        loginMesh.background = this.black;

        var loggingIn = new TextBlock();
        loggingIn.text = "Logging in...";
        loggingIn.color = "white";
        loggingIn.fontSize = 64;
        loggingIn.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
        loggingIn.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;
        loginMesh.addControl(loggingIn);

        // login failed notification for more visual feedback
        this.failedLogin = new TextBlock();
        this.failedLogin.height = "240px";
        this.failedLogin.text = "Log in failed.\n Please re-enter username and/or password.";
        this.failedLogin.color = "white";
        this.failedLogin.fontSize = 42;
        this.failedLogin.top = -420;
        this.failedLogin.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
        this.failedLogin.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;
        guiTexture.addControl(this.failedLogin);
        this.failedLogin.isVisible = false;

        // sync status page for even more visual feedback
        this.syncStatus = MeshBuilder.CreatePlane("syncStatus", {}, this.scene);
        this.syncStatus.position = this.guiPlane.position.clone();
        this.syncStatus.isPickable = false;
        this.syncStatus.isVisible = false;
        
        var syncMesh = AdvancedDynamicTexture.CreateForMesh(this.syncStatus, 512, 512);
        syncMesh.background = this.black;

        var syncing = new TextBlock();
        syncing.text = "Updating environment...";
        syncing.color = this.userColor.toHexString();
        syncing.fontSize = 64;
        syncing.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
        syncing.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;
        syncMesh.addControl(syncing);

        // direction status page for even more visual feedback for tutorial
        this.tutorialStatus = MeshBuilder.CreatePlane("tutorialStatus", {}, this.scene);
        this.tutorialStatus.position = this.guiPlane.position.clone();
        this.tutorialStatus.isPickable = false;
        this.tutorialStatus.isVisible = false;
        
        var tutorialMesh = AdvancedDynamicTexture.CreateForMesh(this.tutorialStatus, 512, 512);
        tutorialMesh.background = this.black;
        
        var conjureText = new TextBlock();
        conjureText.text = "Directions Overview \n 1. Use the right grip to conjure up an item \n 2. Hold right trigger to move that object around!";
        conjureText.color = "white";
        conjureText.fontSize = 20;
        conjureText.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
        conjureText.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;
        tutorialMesh.addControl(conjureText);

        // Create a parent transform for the object configuration panel
        var configTransform = new TransformNode("textTransform");

        // Create a plane for the object configuration panel
        var configPlane = MeshBuilder.CreatePlane("configPlane", {width: 0.45, height: 0.45}, this.scene);
        configPlane.position = new Vector3(-0.3, 2.3, 1);
        configPlane.parent = configTransform;

        var button = Button.CreateImageButton(
            "button",
            "Tutorial of Basic Controller Abilities", 
            // question mark photo 
            "/assets/question_mark.jpg"
          );

        button.textBlock!.color = "white"; 
        button.textBlock!.fontSize = 20; 
        
        // // Create a dynamic texture the object configuration panel
        var configTexture = AdvancedDynamicTexture.CreateForMesh(configPlane, 256, 256);
        configTexture.background = (new Color4(.5, .5, .5, .25)).toHexString();
        configTexture.addControl(button); 

        button.onPointerClickObservable.add((key) => {
           if(this.tutorialStatus?.isVisible)
                {
                    this.tutorialStatus!.isVisible = false;
                    console.log('stack panel should be disabled'); 
                }

            else {
                this.tutorialStatus!.isVisible = true;
                console.log('stack panel should be re-enabled'); 
            }}
        )

        // keyboard to enter user/password
        var virtualKeyboard = VirtualKeyboard.CreateDefaultLayout("virtualKeyboard");
        virtualKeyboard.scaleX = 2.0;
        virtualKeyboard.scaleY = 2.0;
        guiTexture.addControl(virtualKeyboard);
        var isUser = true;
        virtualKeyboard.onKeyPressObservable.add((key) => {
            switch (key) {
                // Backspace
                case '\u2190':
                    if (isUser) {
                        inputUser.processKey(8);
                    } else {
                        inputPass.processKey(8);
                    }
                    break;

                // Shift
                case '\u21E7':
                    virtualKeyboard.shiftState = virtualKeyboard.shiftState == 0 ? 1 : 0;
                    virtualKeyboard.applyShiftState(virtualKeyboard.shiftState);
                    break;

                // Enter
                case '\u21B5':
                    if (isUser) {
                        inputUser.processKey(13);
                        this.user = inputUser.text;
                        inputUser.background = this.gray;
                        inputPass.background = this.black;
                        inputPass.text = "";
                        isUser = false;
                    } else {
                        inputPass.processKey(13);
                        inputUser.background = this.black;
                        inputPass.background = this.gray;
                        isUser = true;

                        // log user in
                        this.loginStatus!.isVisible = true;
                        //console.log('attempting to log in .....');
                        this.connect(this.user, inputPass.text);
                    }

                    break;

                default:
                    if (isUser) {
                        inputUser.processKey(-1, virtualKeyboard.shiftState == 0 ? key : key.toUpperCase());
                    } else {
                        inputPass.processKey(-1, virtualKeyboard.shiftState == 0 ? key : key.toUpperCase());
                    }
            }
        });

        // enable pointer selection/deselection 
        this.scene.onPointerObservable.add((pointerInfo) => {
            this.processPointer(pointerInfo);
        });


    }


    // The main update loop will be executed once per frame before the scene is rendered
    private update() : void
    {
        if (this.trackControllers) {// && this.trackControllers != this.leftController?.pointer.absolutePosition) {
            if (Vector3.Distance(this.trackControllers, this.leftController!.pointer.absolutePosition)) {
                Messages.sendMessage(false, this.createMessage(MessageType.user, this.user));
                this.trackControllers = null;
            } 
        }

        this.processControllerInput();

        // track object position/rotation updates
        if (this.selectedObject) {
            this.frame++;

            //if (this.frame % 20 == 0){   // record position once every 20 frames
            console.log("selected obj pos: " + this.selectedObject.absolutePosition.clone());
            console.log("movement array -1: " + this.movementArray[this.movementArray.length - 1]);
            if (this.frame % 20 == 0 && this.movementArray.length > 0 && Vector3.Distance(this.selectedObject.absolutePosition.clone(), this.movementArray[this.movementArray.length - 1]) > 0.1) {
                this.movementArray.push(this.selectedObject.getAbsolutePosition().clone());
                this.rotationArray.push(this.selectedObject.absoluteRotationQuaternion.toEulerAngles().clone());
            }

            // change texture of selected object if widget is active
            if (this.textureNode.getChildMeshes()[0].isVisible) {
                this.textureNode.getChildMeshes().forEach((mesh) => {
                    if (this.leftHand.intersectsMesh(mesh, true) || this.rightHand.intersectsMesh(mesh, true)) {
                        (<StandardMaterial>this.selectedObject!.material).diffuseTexture = (<StandardMaterial>mesh.material).diffuseTexture;
                    }
                });
            }
        }

    }

    private processControllerInput() {
        this.onRightTrigger(this.rightController?.motionController?.getComponent("xr-standard-trigger"));
        this.onLeftTrigger(this.leftController?.motionController?.getComponent("xr-standard-trigger"));
        this.onLeftSqueeze(this.leftController?.motionController?.getComponent("xr-standard-squeeze"));
        this.onRightSqueeze(this.rightController?.motionController?.getComponent("xr-standard-squeeze"));
        this.onRightThumbstick(this.rightController?.motionController?.getComponent("xr-standard-thumbstick"));
    }

    // set selected object to move with correct hand depending on which hand does the selection
    private onLeftTrigger(component?: WebXRControllerComponent) {
        if (component?.changes.pressed) {
            if (component?.pressed) {
                if (this.selectedObject && !(this.selectedObject.parent)) { // object is selected but does not have a parent
                    this.selectedObject.setParent(this.leftHand);

                    this.destroyWidget.parent = this.leftController!.pointer;
                    //this.colorWidget.parent = this.leftController!.pointer;
                    this.textureWidget.parent = this.leftController!.pointer;

                    // send selection message to other clients
                    Messages.sendMessage(false, this.createMessage(MessageType.item, this.selectedObject.name));
                }
            }
        }
    }
    private onRightTrigger(component?: WebXRControllerComponent) {
        if (component?.changes.pressed) {
            if (component?.pressed) {
                if (this.selectedObject && !(this.selectedObject.parent)) { // object is selected but does not have a parent
                    this.selectedObject.setParent(this.rightHand);

                    this.destroyWidget.parent = this.rightController!.pointer;
                    //this.colorWidget.parent = this.rightController!.pointer;
                    this.textureWidget.parent = this.rightController!.pointer;

                    // send selection message to other clients
                    Messages.sendMessage(false, this.createMessage(MessageType.item, this.selectedObject.name));
                }
            }
        }
    }

    private onLeftSqueeze(component?: WebXRControllerComponent) {
        if (component?.changes.pressed) {
            if (component?.pressed) {
                if (this.selectedObject) {
                    if (this.leftHand.intersectsMesh(this.destroyWidget, true)) {  // destroy selected object if widget is selected
                        this.currentWidget = this.destroyWidget;
                    } else if (this.leftHand.intersectsMesh(this.textureWidget, true)) {
                        this.currentWidget = this.textureWidget;
                    }

                    if (this.currentWidget) {
                        this.widgetPos = this.currentWidget.position.clone();
                        this.currentWidget.setParent(this.leftHand);
                    }
                }
            } else { // release grabbed object
                if (this.currentWidget) {
                    //this.widgetEvent(this.rightHand.absolutePosition.clone());
                    this.widgetEvent(this.rightHand);

                    this.currentWidget.parent = this.rightController!.pointer;
                    this.currentWidget.position = this.widgetPos!;
                    this.currentWidget = null;
                }
            }
        }

    }

    // handle widget selection, create objects
    private onRightSqueeze(component?: WebXRControllerComponent) {
        if (component?.changes.pressed) {
            if (component?.pressed) {
                if (this.selectedObject) {
                    if (this.rightHand.intersectsMesh(this.destroyWidget, true)) {
                        this.currentWidget = this.destroyWidget;
                    }
                    //else if (this.rightHand.intersectsMesh(this.colorWidget, true)) {
                    //    this.currentWidget = this.colorWidget;
                    //}
                    else if (this.rightHand.intersectsMesh(this.textureWidget, true)) {
                        this.currentWidget = this.textureWidget;
                    } else {
                        this.createObject();
                    }

                    // grab widget
                    if (this.currentWidget) {
                        this.widgetPos = this.currentWidget.position.clone();
                        this.currentWidget.setParent(this.rightHand);
                    }
                } else {
                    this.createObject();
                }
            } else { // release grabbed object
                if (this.currentWidget) {
                    //this.widgetEvent(this.leftHand.absolutePosition.clone());
                    this.widgetEvent(this.leftHand);

                    this.currentWidget.parent = this.leftController!.pointer;
                    this.currentWidget.position = this.widgetPos!;
                    this.currentWidget = null;
                }
            }
        }
    }

    // custom teleportation - from Assignment 6
    private onRightThumbstick(component?: WebXRControllerComponent) {
        if (component?.changes.axes) {
            if (component.axes.y < -.75) {
                // Create a new ray cast
                var ray = new Ray(this.rightController!.pointer.position, this.rightController!.pointer.forward, 20);
                var pickInfo = this.scene.pickWithRay(ray);

                // If the ray cast intersected a ground mesh
                if (pickInfo?.hit && this.groundMeshes.includes(pickInfo.pickedMesh!)) {
                    this.teleportPoint = pickInfo.pickedPoint;
                    this.laserPointer!.scaling.z = pickInfo.distance;
                    this.laserPointer!.visibility = 1;
                    this.teleportImage.position = this.teleportPoint!.clone();

                    // teleport location indicator  
                    this.teleportImage.isVisible = true;
                    if (!this.headsetRotation) {
                        this.headsetRotation = this.xrCamera!.rotationQuaternion.clone();
                        var eulers = this.headsetRotation.toEulerAngles();
                        this.headsetRotation = Quaternion.FromEulerAngles(0, eulers.y, 0);
                    }

                    // rotation

                    // find rotation of tagalong node in world space
                    this.rotationNode.setParent(null);
                    var rotate = this.rotationNode.rotation.clone();
                    this.rotationNode.setParent(this.leftController!.pointer);

                    this.teleportImage.rotationQuaternion = this.headsetRotation.clone();
                    var addRotation = Quaternion.FromEulerAngles(-Math.PI / 2, -rotate.z, 0);
                    this.teleportImage.rotationQuaternion?.multiplyInPlace(addRotation);
                }
            } else if (component.axes.y == 0) {
                this.laserPointer!.visibility = 0;
                this.teleportImage.isVisible = false;

                // If we have a valid target point, then teleport the user
                if (this.teleportPoint) {
                    this.xrCamera!.position.x = this.teleportPoint.x;
                    this.xrCamera!.position.y = this.teleportPoint.y + this.xrCamera!.realWorldHeight;
                    this.xrCamera!.position.z = this.teleportPoint.z;

                    // rotation

                    // find rotation of tagalong node in world space
                    this.rotationNode.setParent(null);
                    var rotate = this.rotationNode.rotation.clone();
                    this.rotationNode.setParent(this.leftController!.pointer);

                    var cameraRotation = Quaternion.FromEulerAngles(0, -rotate.z, 0);
                    this.xrCamera!.rotationQuaternion.multiplyInPlace(cameraRotation);

                    this.teleportPoint = null;
                    this.headsetRotation = null;

                    if (this.leftController) {
                        this.trackControllers = this.leftController.pointer.absolutePosition.clone();
                    }
                }

            }
        }
    }

    // object manipulation
    private processPointer(pointerInfo: PointerInfo) {
        switch (pointerInfo.type) {
            case PointerEventTypes.POINTERDOWN:
                //console.log("pointer DOWN");
                //console.log("origin mesh: " + pointerInfo.pickInfo?.originMesh?.name);
                if (pointerInfo.pickInfo?.hit && !pointerInfo.pickInfo.pickedMesh?.name.endsWith("Plane")) {
                    this.selectedObject = pointerInfo.pickInfo.pickedMesh;
                    //console.log("mesh name: " + this.selectedObject?.name);

                    if (this.selectedObject) {

                        // push initial orientation to tracker arrays
                        this.frame = 0;
                        this.movementArray.length = 0;
                        this.rotationArray.length = 0;
                        this.movementArray.push(this.selectedObject.getAbsolutePosition().clone());  // need to push clone or it'll keep updating
                        this.rotationArray.push(this.selectedObject.absoluteRotationQuaternion.toEulerAngles().clone());

                        // enable object manipulation
                        this.destroyWidget.isVisible = true;
                        //this.colorWidget.isVisible = true;
                        this.textureWidget.isVisible = true;
                    }
                }
                break;
            case PointerEventTypes.POINTERUP:
                //console.log("pointer UP");
                if (this.selectedObject) {

                    this.movementArray.push(this.selectedObject.absolutePosition.clone());
                    this.rotationArray.push(this.selectedObject.absoluteRotationQuaternion.toEulerAngles().clone());

                    // deselect object and notify other clients
                    this.selectedObject.setParent(null);
                    if (this.textureNode.getChildMeshes()[0].isVisible) {
                        Messages.sendMessage(false, this.createMessage(MessageType.item, this.selectedObject.name, true));
                    } else {
                        Messages.sendMessage(false, this.createMessage(MessageType.item, this.selectedObject.name));
                    }

                    this.selectedObject = null;
                }

                this.destroyWidget.isVisible = false;
                //this.colorWidget.isVisible = false;
                this.textureWidget.isVisible = false;
                this.textureNode.getChildMeshes().forEach((mesh) => {
                    mesh.isVisible = false;
                });
                break;
        }
    }

    // create random polyhedron - called in rightSqueeze
    private createObject() {
        // create random polyhedron
        var num = Math.round(Math.random() * 14);
        var newMesh = MeshBuilder.CreatePolyhedron("name", { type: num, size: 1 }, this.scene);
        newMesh.name = this.user + newMesh.uniqueId.toString();
        newMesh.position = new Vector3(2, 3, 4);
        newMesh.material = new StandardMaterial((newMesh.name + "_mat"), this.scene);
        this.envObjects.set(newMesh.name, newMesh);

        // send message creation to other clients
        Messages.sendMessage(false, this.createMessage(MessageType.item, newMesh.name, true));
    }

    // handle widget events
    private widgetEvent(parentMesh: AbstractMesh) {
        //if (this.selectedObject && Vector3.Distance(this.currentWidget!.absolutePosition.clone(), parentPos) > this.minMove) {
        if (this.selectedObject && Vector3.Distance(this.currentWidget!.absolutePosition.clone(), parentMesh.absolutePosition.clone()) > this.minMove) {
            if (this.currentWidget!.name.startsWith("destroy")) {
                this.destroyObj();
            } else if (this.currentWidget!.name.startsWith("color")) {
                //console.log("color");
                //this.colorPicker.isVisible = true;
                //this.colorPicker.setParent(parentMesh);
                //Messages.sendMessage(false, this.createMessage(MessageType.item, this.selectedObject.name, true));
            } else if (this.currentWidget!.name.startsWith("texture")) {
                //console.log("texture");
                this.textureNode.position = this.currentWidget!.absolutePosition.clone();
                this.textureNode.getChildMeshes().forEach((mesh) => {
                    mesh.isVisible = true;
                });
            }
        }
    }

    // destroy object - called when destroyWidget is activated
    private destroyObj() {
        console.log("destroy");

        if (this.selectedObject) {
            this.envObjects.delete(this.selectedObject.name);
            Messages.sendMessage(false, this.createMessage(MessageType.remove, this.selectedObject.name));

            this.selectedObject.dispose();
            this.selectedObject = null;

            this.destroyWidget.isVisible = false;
            //this.colorWidget.isVisible = false;
            this.textureWidget.isVisible = false;
        }
    }

    private createMessage(type: MessageType, id: string, serializeNew: boolean = false) : string {
        var message = {};

        switch (type) {
            case MessageType.item: // used for either creating or updating an item
                message = {
                    id: id,
                    type: type,
                    mesh: serializeNew ? ("data:" + JSON.stringify(SceneSerializer.SerializeMesh(this.envObjects.get(id)!, false, false))) : "",
                    info: serializeNew ? {} : {
                        // position: this.selectedObject!.absolutePosition.clone(),
                        position: this.movementArray,
                        //rotation: this.selectedObject!.absoluteRotationQuaternion.toEulerAngles().clone(),
                        rotation: this.rotationArray,
                        scaling: this.selectedObject!.scaling.clone(),
                        selected: this.selectedObject!.parent ? true : false,
                        color: this.userColor
                    },
                    userInfo: JSON.parse(this.createMessage(MessageType.user, this.user))
                };
                break;
            case MessageType.user: // used for creating/updating users
                message = {
                    id: id,
                    type: type,
                    info: {
                        hpos: this.xrCamera?.position,
                        hrot: this.xrCamera?.rotation,
                        lpos: this.leftHand.absolutePosition,
                        rpos: this.rightHand.absolutePosition,
                        color: this.userColor
                    }
                };
                break;
            case MessageType.sync: // used for syncing environment with new user if admin
                var meshes: any[] = [];
                this.envObjects.forEach((mesh, id) => {
                    var msg = {
                        id: id,
                        type: MessageType.item,
                        mesh: "data:" + JSON.stringify(SceneSerializer.SerializeMesh(mesh)),
                    };

                    meshes.push(msg);
                });

                message = {
                    type: type,
                    meshes: meshes
                };
                break;
            case MessageType.remove:  // remove items and users
                message = {
                    id: id,
                    type: type
                }
                break;
        }

        //console.log("sending message: " + JSON.stringify(message));
        return JSON.stringify(message);
    }

    // updates environment according to message received from room
    private updateEnv(message: string) {
        //console.log("message: " + message);
        var msg = JSON.parse(message.trim());

        switch (msg.type) {
            case MessageType.item:  // handle both item creation and updates
                var item = this.envObjects.get(msg.id);

                if (!item) {  // add new item to room
                    if (msg.mesh != "") {
                        SceneLoader.ImportMesh("", "", msg.mesh, this.scene);
                        this.envObjects.set(msg.id, this.scene.meshes[this.scene.meshes.length - 1]);
                    }
                } else {  // update existing item
                    if (msg.mesh?.length == "") {  // update mesh positions only
                        // item.position = Object.assign(item.position, msg.info.position);
                        // item.rotation = Object.assign(item.rotation, msg.info.rotation);
                        // item.scaling = Object.assign(item.scaling, msg.info.scaling);

                        if (this.isUpdateComplete){

                            this.frame = 0; 
                            if (item.position) { // how is this even running??

                                var object_animation = new Animation("object_animation", "position", 30, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
                                var rotationAnimation = new Animation("rotationAnimation", "rotation", 30, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);

                                var movement_array = msg.info.position;
                                var rotation_array = msg.info.rotation;

                                //console.log('movement array! ', movement_array);
                                var movement_with_frame = [];
                                var rotation_with_frame = [];
                                var frame = 0;

                                this.isUpdateComplete = false;

                                if (movement_array && rotation_array) {

                                    for (let vector of movement_array){
                                        var pos = Object.assign(new Vector3(), vector);

                                        movement_with_frame.push(
                                            {
                                                frame: frame, 
                                                value: pos
                                            }
                                        )
                                        frame = frame + 20; 
                                    }

                                    frame = 0;

                                    for (let vector of rotation_array) {
                                        var rot = Object.assign(new Vector3(), vector);

                                        rotation_with_frame.push(
                                            {
                                                frame: frame,
                                                value: rot
                                            }
                                        )
                                        frame += 20;
                                    }

                                    object_animation.setKeys(movement_with_frame);
                                    rotationAnimation.setKeys(rotation_with_frame);

                                    item.animations = [];
                                    item.animations.push(object_animation);
                                    item.animations.push(rotationAnimation);

                                    this.scene.beginWeightedAnimation(item, 0, frame - 20, 1.0, false, 1.0, () => {
                                        frame = 0;
                                        this.isUpdateComplete = true;

                                        // intended to update positions after animation is complete
                                        item!.position = Object.assign(item!.position, movement_array[-1]);  // will go to most recent position
                                        //item!.rotation = Object.assign(item!.rotation, msg.info.rotation);
                                        item!.rotation = Object.assign(item!.rotation, rotation_array[-1]);
                                        item!.scaling = Object.assign(item!.scaling, msg.info.scaling);

                                        this.scene.removeAnimation(object_animation);
                                        this.scene.removeAnimation(rotationAnimation);
                                    });

                                }
                            }
                        }

                        if (msg.info.selected) {  // if other user has object selected, highlight in their color and disable selection
                            console.log("item selected!!!");
                            item.edgesColor = Object.assign(item.edgesColor, msg.info.color);
                            item.enableEdgesRendering();
                            item.isPickable = false;
                        }
                        else {  // when other user deselects, unhighlight and allow selection
                            item.disableEdgesRendering();
                            item.isPickable = true;
                        }
                    } else {
                        // load updated mesh from JSON string - more than position changed
                        this.envObjects.get(msg.id)?.dispose();
                        this.envObjects.delete(msg.id);

                        SceneLoader.ImportMesh("", "", msg.mesh, this.scene);
                        this.envObjects.set(msg.id, this.scene.meshes[this.scene.meshes.length - 1]);
                    }

                    this.updateEnv(JSON.stringify(msg.userInfo));
                }
                break;
            
            case MessageType.user:  // handle both user creation and updates
                var user = this.envUsers.get(msg.id);

                if (!user) { // add new user
                    if (this.admin) { // send env sync to new user if this user is admin
                        Messages.sendMessage(false, this.createMessage(MessageType.sync, ""));
                    }

                    // add user to list, update new user with this user's info
                    this.envUsers.set(msg.id, new User(msg.id, msg.info, this.scene));
                    Messages.sendMessage(false, this.createMessage(MessageType.user, this.user));

                } else { // update existing user
                    user.update(msg.info);
                }
                break;
            case MessageType.sync:
                if (this.admin) {  // admin set to true at first, and actual admin will never see a sync message, but other users shouldn't sync
                    //this.syncStatus!.isVisible = true;
                    msg.meshes.forEach((message: any) => {
                        this.updateEnv(JSON.stringify(message));
                    });
                    this.admin = false;
                    //this.syncStatus!.isVisible = false;
                }
                break;
            case MessageType.remove:
                var item = this.envObjects.get(msg.id);
                if (item) {
                    this.envObjects.delete(msg.id);
                    item.dispose();
                } else {
                    var user = this.envUsers.get(msg.id);
                    if (user) {
                        this.envUsers.delete(msg.id);
                        user.remove();
                    }
                }
                break;
        }
    }


    private async connect(user: string, pass: string) {
        // login
        await this.client.login("m.login.password", { user: user, password: pass }).then((response: any) => {
            console.log("logged in!");

            this.client.joinRoom(this.room).then((response: any) => {
                console.log("user joined room");
            });
        }).catch((err: any) => {
            console.log("error logging in user " + user);
            this.loginStatus!.isVisible = false;
            this.failedLogin!.isVisible = true;
        });

        // avoid attempting connnection if not logged in
        if (!this.loginStatus!.isVisible) {
            return;
        }

        // if logged in, dispose of login GUI
        if (this.guiPlane){ // TODO may just need to make invisible to handle logout/login
            this.guiPlane!.dispose(false, true);
        }

        // start client
        await this.client.startClient({ initialSyncLimit: 10 });
        
        // sync client - hopefully finishes before sync is needed
        await this.client.once('sync', (state: any, prevState: any, res: any) => {

            // create self user object for other clients
            Messages.sendMessage(false, this.createMessage(MessageType.user, this.user));

            // allows user to view tutorial when first starting to run 
            this.tutorialStatus!.isVisible = true; 

            // add message listener to room
            this.client.on("event", (event: any) => {
                //console.log("sync state: " + this.client.getSyncState());
                if (event.getRoomId() == this.room && ("@" + this.user + ":matrix.org") != event.getSender()) {

                    // send messages to function to check if it's an update message
                    if (event.event.type == 'm.room.message') {
                        this.updateEnv(event.event.content.body);
                        if (event.event.content.body) {
                            event.event.content.body = event.event.content.body.trim()
                            var body = JSON.parse(event.event.content.body);
                        }
                    }
                }
            });
            
            this.loginStatus!.dispose(false, true);
        });
    }
}
/******* End of the Game class ******/



// represent users
class User {

    // username
    private user: string;

    // visualize headset and controllers
    private head: AbstractMesh;
    private left: AbstractMesh;
    private right: AbstractMesh;

    // add a body and arms
    private body: AbstractMesh;
    private shoulders: Vector3[] = [];
    private leftArm: LinesMesh;
    private rightArm: LinesMesh;

    // user's highlight color
    private color: Color3;

    // takes in user ID and JSON object with position info 
    constructor(id: string, info: any, scene: Scene) {
        this.user = id;
        this.head = MeshBuilder.CreateBox((id + "_head"), { size: 0.3 });
        this.left = MeshBuilder.CreateSphere((id + "_left"), { segments: 8, diameter: 0.1 });
        this.right = MeshBuilder.CreateSphere((id + "_right"), { segments: 8, diameter: 0.1 });

        this.body = MeshBuilder.CreateBox((id + "_body"), { width: 0.2, height: 0.4, depth: 0.05 });
        this.body.parent = this.head;
        this.body.position = new Vector3(0, -0.5, 0);
        this.shoulders.push(this.head.absolutePosition.clone());
        this.shoulders.push(this.head.absolutePosition.clone());
        this.shoulders[0].x -= 0.1;
        this.shoulders[0].y -= 0.3;
        this.shoulders[0].x += 0.1;
        this.shoulders[0].y -= 0.3;
        this.leftArm = MeshBuilder.CreateLines("leftArm", { points: [this.shoulders[0], this.left.absolutePosition.clone()], updatable: true });
        this.rightArm = MeshBuilder.CreateLines("rightArm", { points: [this.shoulders[1], this.right.absolutePosition.clone()], updatable: true });

        this.head.isPickable = false;
        this.left.isPickable = false;
        this.right.isPickable = false;
        this.body.isPickable = false;
        this.leftArm.isPickable = false;
        this.rightArm.isPickable = false;

        this.color = Object.assign(new Color3(), info.color);
        this.head.material = new StandardMaterial((id + "_headMat"), scene);
        this.left.material = new StandardMaterial((id + "_leftMat"), scene);
        this.right.material = new StandardMaterial((id + "_rightMat"), scene);
        this.body.material = new StandardMaterial((id + "_bodyMat"), scene);
        (<StandardMaterial>this.head.material).emissiveColor = this.color;
        (<StandardMaterial>this.left.material).emissiveColor = this.color;
        (<StandardMaterial>this.right.material).emissiveColor = this.color;
        (<StandardMaterial>this.body.material).emissiveColor = this.color;

        this.update(info);
    }

    // removes this user from the room
    public remove() {
        this.head.dispose();
        this.left.dispose();
        this.right.dispose();
        this.body.dispose();
        this.shoulders.length = 0;
    }

    // updates position of user object
    public update(info: any) {
        this.head.setAbsolutePosition(Object.assign(this.head.position, info.hpos));
        this.head.rotation = Object.assign(this.head.rotation, info.hrot);
        this.left.setAbsolutePosition(Object.assign(this.left.position, info.lpos));
        this.right.setAbsolutePosition(Object.assign(this.right.position, info.rpos));


        this.shoulders[0] = this.head.absolutePosition.clone();
        this.shoulders[0].x -= 0.1;
        this.shoulders[0].y -= 0.3;
        this.shoulders[1] = this.head.absolutePosition.clone();
        this.shoulders[1].x += 0.1;
        this.shoulders[1].y -= 0.3;
        this.leftArm = MeshBuilder.CreateLines("leftArm", { points: [this.shoulders[0], this.left.absolutePosition.clone()], updatable: true, instance: this.leftArm });
        this.rightArm = MeshBuilder.CreateLines("rightArm", { points: [this.shoulders[1], this.right.absolutePosition.clone()], updatable: true, instance: this.rightArm });
    }
}

// start the game
var game = new Game();
game.start();