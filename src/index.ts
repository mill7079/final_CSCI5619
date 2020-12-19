/* CSCI 5619 Final, Fall 2020
 * Authors: Angel Sylvester and Allison Miller
 * */ 

import { Engine } from "@babylonjs/core/Engines/engine"; 
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
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
import { InputPassword, InputText } from "@babylonjs/gui/2D/controls";
import { VirtualKeyboard } from "@babylonjs/gui/2D/controls/virtualKeyboard";
import { TextBlock } from "@babylonjs/gui/2D/controls/textBlock";
import { SceneSerializer } from "@babylonjs/core/Misc/sceneSerializer";
import { SceneLoader } from "@babylonjs/core/Loading/sceneLoader";
import { Mesh } from "@babylonjs/core/Meshes/mesh";
import { PointerEventTypes, PointerInfo } from "@babylonjs/core/Events/pointerEvents";
import { Animation } from "@babylonjs/core/Animations/animation";
import { LinesMesh } from "@babylonjs/core/Meshes/linesMesh";

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
    private prevObjPos: Vector3 | null;
    private minMove = 1;

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

    private failedLogin: TextBlock | null;

    private admin = true;
    private frame = 0; 
    private movementArray: Array<Vector3>;
    private rotationArray: Vector3[];

    // in-environment GUI items
    //private colorWidget: ;
    //private textureWidget;
    private destroyWidget: AbstractMesh;

    constructor()
    {
        // Get the canvas element 
        this.canvas = document.getElementById("renderCanvas") as HTMLCanvasElement;

        // Generate the BABYLON 3D engine
        this.engine = new Engine(this.canvas, true); 

        // Creates a basic Babylon Scene object
        this.scene = new Scene(this.engine);   

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
        this.prevObjPos = null;

        this.isUpdateComplete = true;

        // create client on server
        this.client = Messages.client;

        this.guiPlane = null;
        this.loginStatus = null;
        this.failedLogin = null;
        this.syncStatus = null;

        this.envUsers = new Map();
        this.envObjects = new Map();
        this.userColor = new Color3(Math.random(), Math.random(), Math.random());

        // intended to keep track of motion of object selected 
        this.frame = 0;
        this.movementArray = [];
        this.rotationArray = [];

        // grab this to destroy the selected object
        this.destroyWidget = MeshBuilder.CreateSphere("destroyWidget", { segments: 4, diameter: 0.05 }, this.scene);
        this.destroyWidget.material = new StandardMaterial("destroyMaterial", this.scene);
        (<StandardMaterial>this.destroyWidget.material).diffuseColor = new Color3(0.5, 0, 0);
        this.destroyWidget.isPickable = false;
        this.destroyWidget.isVisible = false;

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

        // Make sure the ground and skybox are not pickable!
        environment!.ground!.isPickable = false;
        environment!.skybox!.isPickable = false;

        // Creates the XR experience helper
        const xrHelper = await this.scene.createDefaultXRExperienceAsync({});

        // Assigns the web XR camera to a member variable
        this.xrCamera = xrHelper.baseExperience.camera;

        this.xrCamera.onAfterCameraTeleport.add((eventData, state) => {
            //this.rightHand.material = new StandardMaterial("rightMat", this.scene);
            //(<StandardMaterial>this.rightHand.material).emissiveColor = new Color3(0.5, 0, 0.5);

            //Messages.sendMessage(false, this.createUpdate(this.user));
            Messages.sendMessage(false, this.createMessage(MessageType.user, this.user));
        });


        // Remove default teleportation
        //xrHelper.teleportation.dispose();
        xrHelper.teleportation.addFloorMesh(environment!.ground!);

        // There is a bug in Babylon 4.1 that fails to reenable pointer selection after a teleport
        // This is a hacky workaround that disables a different unused feature instead
        xrHelper.teleportation.setSelectionFeature(xrHelper.baseExperience.featuresManager.getEnabledFeature("xr-background-remover"));

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

                this.destroyWidget.parent = this.rightController.pointer;
                this.destroyWidget.position = new Vector3(0, -0.07, -0.11);
            }
            else 
            {
                this.leftController = inputSource;
                this.leftHand.parent = this.leftController.grip!;
                this.leftHand.isVisible = true;
            }

            //Messages.sendMessage(false, this.createUpdate(this.user));
            Messages.sendMessage(false, this.createMessage(MessageType.user, this.user));
        });

        // Don't forget to deparent objects from the controllers or they will be destroyed!
        xrHelper.input.onControllerRemovedObservable.add((inputSource) => {

            if (inputSource.uniqueId.endsWith("right")) {
                this.rightHand.parent = null;
                this.rightHand.isVisible = false;
            } else {
                this.leftHand.parent = null;
                this.leftHand.isVisible = false;
            }

            if (!this.rightHand.isVisible && !this.leftHand.isVisible) {
                //var remove = {
                //    status: "remove",
                //    type: "user",
                //    id: this.user,
                //    info: {
                        
                //    }
                //}
                //Messages.sendMessage(false, JSON.stringify(remove));  // TODO
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
                        console.log('attempting to log in .....');
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
        this.processControllerInput();

        // track object positionn/rotation updates
        if (this.selectedObject) {
            this.frame++;

            if (this.frame % 20 == 0){   // let's make it do this only every 20 frames 
                //console.log('pushing selected object positions during each frame ..'); 
                this.movementArray.push(this.selectedObject.getAbsolutePosition().clone());
                this.rotationArray.push(this.selectedObject.absoluteRotationQuaternion.toEulerAngles().clone());
            } 
        }
    }

    private processControllerInput() {
        this.onLeftSqueeze(this.leftController?.motionController?.getComponent("xr-standard-squeeze"));
        this.onRightSqueeze(this.rightController?.motionController?.getComponent("xr-standard-squeeze"));
    }

    private onLeftSqueeze(component?: WebXRControllerComponent) {
        if (component?.changes.pressed) {
            if (component?.pressed && this.selectedObject) {
                if (this.leftHand.intersectsMesh(this.destroyWidget, true)) {  // destroy selected object if widget is selected
                    this.envObjects.delete(this.selectedObject.name);

                    Messages.sendMessage(false, this.createMessage(MessageType.remove, this.selectedObject.name));
                    this.selectedObject.dispose();
                    this.selectedObject = null;

                    this.destroyWidget.isVisible = false;
                }
            }
        }
    }

    private onRightSqueeze(component?: WebXRControllerComponent) {
        if (component?.changes.pressed) {
            if (component?.pressed) {

                // create random polyhedron
                var num = Math.round(Math.random() * 14);
                var newMesh = MeshBuilder.CreatePolyhedron("name", { type: num, size: 1 }, this.scene);
                newMesh.name = this.user + newMesh.uniqueId.toString();
                newMesh.position = new Vector3(2, 3, 4);
                this.envObjects.set(newMesh.name, newMesh);

                // send message creation to other clients
                Messages.sendMessage(false, this.createMessage(MessageType.item, newMesh.name, true));
            }
        }
    }

    // object manipulation
    private processPointer(pointerInfo: PointerInfo) {
        switch (pointerInfo.type) {
            case PointerEventTypes.POINTERDOWN:
                if (pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedMesh?.name != "guiPlane") {
                    this.selectedObject = pointerInfo.pickInfo.pickedMesh;

                    if (this.selectedObject) {
                        this.prevObjPos = this.selectedObject.absolutePosition.clone();
                        this.selectedObject.setParent(this.rightHand);

                        // push initial orientation to tracker arrays
                        this.frame = 0;
                        this.movementArray.length = 0;
                        this.rotationArray.length = 0;
                        this.movementArray.push(this.selectedObject.getAbsolutePosition().clone());  // need to push clone or it'll keep updating
                        this.rotationArray.push(this.selectedObject.absoluteRotationQuaternion.toEulerAngles().clone());

                        // send selection message to other clients
                        Messages.sendMessage(false, this.createMessage(MessageType.item, this.selectedObject.name));

                        // enable object destruction
                        this.destroyWidget.isVisible = true;
                    }
                }
                break;
            case PointerEventTypes.POINTERUP:
                if (this.selectedObject) {

                    // deselect object and notify other clients
                    this.selectedObject.setParent(null);
                    Messages.sendMessage(false, this.createMessage(MessageType.item, this.selectedObject.name));

                    this.selectedObject = null;
                    this.prevObjPos = null;
                }

                this.destroyWidget.isVisible = false;
                break;
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

                        if (this.isUpdateComplete){  // TODO i feel like this is going to screw with things...

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

                                    //this.scene.beginAnimation(item, 0, frame - 20, false, 1, () =>
                                    //{
                                    //    //console.log('animation complete'); 
                                    //    frame = 0; 
                                    //    this.isUpdateComplete = true;


                                    //    // intended to update positions after animation is complete
                                    //    item!.position = Object.assign(item!.position, movement_array[-1]);  // will go to most recent position
                                    //    item!.rotation = Object.assign(item!.rotation, msg.info.rotation);
                                    //    item!.scaling = Object.assign(item!.scaling, msg.info.scaling);

                                    //    this.scene.removeAnimation(object_animation); 

                                    //});

                                }
                            }
                        }

                        if (msg.info.selected) {  // if other user has object selected, highlight in their color and disable selection
                            item.edgesColor = Object.assign(item.edgesColor, msg.info.color);
                            item.enableEdgesRendering();
                            item.isPickable = false;
                        } else {  // when other user deselects, unhighlight and allow selection
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