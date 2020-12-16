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

import * as MATRIX from "matrix-js-sdk";

// Side effects
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/inspector";

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
            console.log(err);
        });
    }
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
    private black = "#070707";
    private gray = "#707070";

    private envUsers: Map<string, User>;
    private envObjects: Map<string, AbstractMesh>;
    private userColor: Color3;

    //private userPosition: Vector3 | null; 
    //private leftPosition: Vector3 | null;
    //private rightPosition: Vector3 | null;
    //private userObj: User | null = null;

    private failedLogin: TextBlock | null;

    private admin = true;

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

        // set up positions 
        //this.userPosition = null; 
        //this.leftPosition = null; 
        //this.rightPosition = null; 

        // create client on server
        //this.client = MATRIX.createClient("https://matrix.org");
        this.client = Messages.client;

        this.guiPlane = null;
        this.loginStatus = null;
        this.failedLogin = null;

        this.envUsers = new Map();
        this.envObjects = new Map();
        this.userColor = new Color3(Math.random(), Math.random(), Math.random());
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

            Messages.sendMessage(false, this.createUpdate(this.user));
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
            }
            else 
            {
                this.leftController = inputSource;
                this.leftHand.parent = this.leftController.grip!;
                this.leftHand.isVisible = true;
            }

            Messages.sendMessage(false, this.createUpdate(this.user));
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
                var remove = {
                    status: "remove",
                    type: "user",
                    id: this.user,
                    info: {
                        
                    }
                }
                Messages.sendMessage(false, JSON.stringify(remove));
                this.client.stopClient();
                this.client.logout();
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
                        //this.password = inputPass.text;
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

        // send a message
        //var message = {
        //    body: "hello",
        //    msgtype: "m.text"
        //};
        //this.client.sendEvent("!FQlzwKdCBFuEnQusdk:matrix.org", "m.room.message", message, "");

        // enable pointer selection/deselection 
        this.scene.onPointerObservable.add((pointerInfo) => {
            this.processPointer(pointerInfo);
        });


    }


    // The main update loop will be executed once per frame before the scene is rendered
    private update() : void
    {
        this.processControllerInput();

        //if (this.selectedObject && Vector3.Distance(this.selectedObject!.absolutePosition, this.prevObjPos!) >= this.minMove) {
        //    console.log("update time");
        //    Messages.sendMessage(false, this.createUpdate(this.selectedObject.uniqueId.toString()));
        //    this.prevObjPos = this.selectedObject.absolutePosition.clone();
        //}


        //if (this.selectedObject != null) {
        //    //console.log("sending message!");
        //    Messages.sendMessage(false, this.createUpdate(this.selectedObject.uniqueId.toString()));
        //}
    }

    private processControllerInput() {
        this.onRightSqueeze(this.rightController?.motionController?.getComponent("xr-standard-squeeze"));
    }

    private onRightSqueeze(component?: WebXRControllerComponent) {
        if (component?.changes.pressed) {
            if (component?.pressed) {

                // create random polyhedron
                var num = Math.round(Math.random() * 14);
                var newMesh = MeshBuilder.CreatePolyhedron("name", { type: num, size: 1 }, this.scene);
                newMesh.position = new Vector3(2, 3, 4);
                this.envObjects.set(newMesh.uniqueId.toString(), newMesh);

                // send serialized mesh to other clients
                let message = {
                    status: "create",
                    type: "item",
                    id: newMesh.uniqueId.toString(),
                    user: this.user,
                    mesh: "data:" + JSON.stringify(SceneSerializer.SerializeMesh(newMesh)),
                    info: {
                        position: newMesh.absolutePosition.clone()
                    }
                };

                Messages.sendMessage(false, JSON.stringify(message));
                //Messages.sendMessage(false, this.createUpdate(this.user));
            }
        }
    }

    // object manipulation
    private processPointer(pointerInfo: PointerInfo) {
        switch (pointerInfo.type) {
            case PointerEventTypes.POINTERDOWN:
                if (pointerInfo.pickInfo?.hit && pointerInfo.pickInfo.pickedMesh?.name != "guiPlane") {
                    this.selectedObject = pointerInfo.pickInfo.pickedMesh;
                    this.prevObjPos = this.selectedObject!.absolutePosition.clone();
                    this.selectedObject?.setParent(this.rightHand);
                    if (this.selectedObject) {
                        Messages.sendMessage(false, this.createUpdate(this.selectedObject.uniqueId.toString()));

                        // this is a test to see if it will update user's hand more actively
                        Messages.sendMessage(false, this.createUpdate(this.user)); 
                    }
                }
                break;
            case PointerEventTypes.POINTERUP:
                this.selectedObject?.setParent(null);
                if (this.selectedObject) {
                    Messages.sendMessage(false, this.createUpdate(this.selectedObject.uniqueId.toString()));

                    // this is a test to see if it will update user's hand more actively
                    Messages.sendMessage(false, this.createUpdate(this.user)); 
                }

                this.selectedObject = null;
                this.prevObjPos = null;
                break;
        }

        //Messages.sendMessage(false, this.createUpdate(this.user));
    }

    // writes update message in correct format
    private createUpdate(id: string): string {
        var ret = {};
        if (id == this.user) { // write update message for user
            ret = {
                status: "update",
                type: "user",
                id: this.user,
                info: {
                    hpos: this.xrCamera?.position.clone(),
                    hrot: this.xrCamera?.rotation.clone(),
                    lpos: this.leftHand.absolutePosition.clone(),
                    rpos: this.rightHand.absolutePosition.clone(),
                    color: this.userColor
                }
            };
        } else if (id == "sync") {
            var meshes : any[] = [];
            this.envObjects.forEach((mesh, id) => {
                var message = {
                    status: "create",
                    type: "item",
                    id: id,
                    mesh: "data:" + JSON.stringify(SceneSerializer.SerializeMesh(mesh)),
                    info: {

                    }
                };

                meshes.push(message);
            });
            ret = {
                status: "sync",
                info: {
                    meshes: meshes
                }
            };
        } else { // write update message for item
            if (this.selectedObject){
                ret = {
                    status: "update",
                    type: "item",
                    id: id,
                    user: this.user,
                    //mesh: "data:" + JSON.stringify(SceneSerializer.SerializeMesh(this.selectedObject!)),
                    info: { 
                        position: this.selectedObject!.absolutePosition.clone(),
                        rotation: this.selectedObject!.absoluteRotationQuaternion.toEulerAngles().clone(),
                        scaling: this.selectedObject!.scaling.clone(),
                        selected: this.selectedObject.parent ? true : false,
                        color: this.userColor
                    }
                };
            }
        }

        return JSON.stringify(ret);
    }

    // updates environment according to message received from room
    private updateEnv(message: string) {
        console.log("message: " + message);
        if (message) {
            message = message.trim();
            var msg = JSON.parse(message);
            if (msg.info) {
                // msg.info = msg.info.trim()
                var msgInfo = msg.info;

                switch (msg.status) {
                    case "create": // only used for items
                        // import mesh from serialized mesh
                        SceneLoader.ImportMesh("", "", msg.mesh, this.scene);

                        // add imported mesh to list with its unique id
                        //let newMesh = this.scene.meshes[this.scene.meshes.length - 1];
                        this.envObjects.set(msg.id, this.scene.meshes[this.scene.meshes.length - 1]);

                        break;
                    case "update":
                        switch (msg.type) {
                            case "user":
                                var user = this.envUsers.get(msg.id);

                                if (!user) { // add new user
                                    if (this.admin) { // send env sync to new user if this user is admin
                                        Messages.sendMessage(false, this.createUpdate("sync"));
                                    }

                                    // add user to list, update new user with this user's info 
                                    this.envUsers.set(msg.id, new User(msg.id, msgInfo, this.scene));
                                    Messages.sendMessage(false, this.createUpdate(this.user));

                                } else { // update existing user
                                    user.update(msgInfo);
                                }
                                break;

                            case "item":
                                var env_object = this.envObjects.get(msg.id);
                                // want way to attach mesh to hand of other users

                                if (env_object) { // update info of item 
                                    env_object.position = Object.assign(env_object.position, msgInfo.position);
                                    env_object.rotation = Object.assign(env_object.rotation, msgInfo.rotation);
                                    env_object.scaling = Object.assign(env_object.scaling, msgInfo.scaling);
                                    //console.log("msgInfo.selected: " + msgInfo.selected);
                                    if (msgInfo.selected) {
                                        env_object.edgesColor = Object.assign(env_object.edgesColor, msgInfo.color);
                                        env_object.enableEdgesRendering();
                                        env_object.isPickable = false;
                                        //console.log("other user selected object");
                                    } else {
                                        env_object.disableEdgesRendering();
                                        env_object.isPickable = true;
                                        //console.log("other user deselected object");
                                    }
                                }


                                // attempt to update meshes using same import method
                                // appears to duplicate presynced meshes?
                                //this.envObjects.get(msg.id)?.dispose();
                                //this.envObjects.delete(msg.id);

                                //SceneLoader.ImportMesh("", "", msg.mesh, this.scene);
                                //this.envObjects.set(msg.id, this.scene.meshes[this.scene.meshes.length - 1]);
                        }
                        break;
                    case "remove":
                        this.envUsers.get(msg.id)?.remove();
                        this.envUsers.delete(msg.id);
                        break;
                    case "sync": // sync existing objects in environment 
                        msgInfo.meshes.forEach((message: any) => {
                            this.updateEnv(JSON.stringify(message));
                        });
                        this.admin = false;
                        break;
                }
            }
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
        if (this.guiPlane){
            this.guiPlane!.dispose(false, true);
        }

        // start client
        await this.client.startClient({ initialSyncLimit: 10 });

        // sync client - hopefully finishes before sync is needed
        await this.client.once('sync', (state: any, prevState: any, res: any) => {
            console.log("client state: " + state); // state will be 'PREPARED' when the client is ready to use

            // create self user object
            Messages.sendMessage(false, this.createUpdate(this.user));

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

    // user's highlight color
    private color: Color3;

    // takes in user ID and JSON object with position info 
    constructor(id: string, info: any, scene: Scene) {
        this.user = id;
        this.head = MeshBuilder.CreateBox((id + "_head"), { size: 0.3 });
        this.left = MeshBuilder.CreateSphere((id + "_left"), { segments: 8, diameter: 0.1 });
        this.right = MeshBuilder.CreateSphere((id + "_right"), { segments: 8, diameter: 0.1 });

        this.head.isPickable = false;
        this.left.isPickable = false;
        this.right.isPickable = false;

        this.color = Object.assign(new Color3(), info.color);
        this.head.material = new StandardMaterial((id + "_headMat"), scene);
        this.left.material = new StandardMaterial((id + "_leftMat"), scene);
        this.right.material = new StandardMaterial((id + "_rightMat"), scene);
        (<StandardMaterial>this.head.material).emissiveColor = this.color;
        (<StandardMaterial>this.left.material).emissiveColor = this.color;
        (<StandardMaterial>this.right.material).emissiveColor = this.color;

        this.update(info);
    }

    // removes this user from the room
    public remove() {
        this.head.dispose();
        this.left.dispose();
        this.right.dispose();

        //var content = {
        //    type: "remove",
        //    content: this.user
        //};

        //Messages.sendMessage(false, JSON.stringify(content));
    }

    public update(info: any) {
        //var obj = JSON.parse(info);

        Object.assign(this.head.position, info.hpos);
        Object.assign(this.head.rotation, info.hrot);
        Object.assign(this.left.position, info.lpos);
        Object.assign(this.right.position, info.rpos);
    }

    // return JSON string
    public toString() {
        var ret = {
            status: "update",
            type: "user",
            id: this.user,
            info: {
                hpos: this.head.position.clone(),
                hrot: this.head.rotation.clone(),
                lpos: this.left.position.clone(),
                rpos: this.left.position.clone()
            }
        };

        return JSON.stringify(ret);
    }
}


//class Item {

//    private id: string;
//    //private mesh: AbstractMesh;

//    // pass in ID and options for meshbuilder
//    //constructor(id: string, opts: string) {
//    //    this.id = id;
//    //    var type = id.split("_")[0];
//    //    //switch (type) {
//    //    //    case "box":
//    //    //        this.mesh = MeshBuilder.CreateBox(id, )
//    //    //}
//    //}


//    constructor(createInfo: string) {
//        var parsedInfo: 4
//    }

//    public update(info: string) {

//    }
//}

// start the game
var game = new Game();
game.start();