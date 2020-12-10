/* CSCI 5619 Final, Fall 2020
 * Author: Evan Suma Rosenberg
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 */ 

import { Engine } from "@babylonjs/core/Engines/engine"; 
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
import { WebXRControllerComponent } from "@babylonjs/core/XR/motionController/webXRControllercomponent";
import { WebXRInputSource } from "@babylonjs/core/XR/webXRInputSource";
import { WebXRCamera } from "@babylonjs/core/XR/webXRCamera";
import { PointLight } from "@babylonjs/core/Lights/pointLight";
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

    private client: any;
    private user = "";
    private room = Messages.room;

    private guiPlane: AbstractMesh | null;
    private loginStatus: AbstractMesh | null;
    private black = "#070707";
    private gray = "#808080";

    //private gameState: State;
    private envUsers: Map<string, User>;
    private envObjects: Map<string, Mesh>;

    private userPosition: Vector3 | null; 
    private leftPosition: Vector3 | null;
    private rightPosition: Vector3 | null;
    private userObj: User | null = null;

    private failedLogin: TextBlock | null;

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

        // set up positions 
        this.userPosition = null; 
        this.leftPosition = null; 
        this.rightPosition = null; 

        // create client on server
        //this.client = MATRIX.createClient("https://matrix.org");
        this.client = Messages.client;

        this.guiPlane = null;
        this.loginStatus = null;
        this.failedLogin = null;

        //this.gameState = new State();
        this.envUsers = new Map();
        this.envObjects = new Map();
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

        // Remove default teleportation
        xrHelper.teleportation.dispose();

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

            this.userObj?.move(this.xrCamera!.position, this.xrCamera!.rotation, this.leftHand.absolutePosition, this.rightHand.absolutePosition);

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
        });

        //this.scene.debugLayer.show();

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
        //inputPass.background = "#070707";
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

        //var userTest = new User("mill7079", new Vector3(1, 2, 3), new Vector3(0, 0, 0), new Vector3(0, 0.5, 3), new Vector3(2, 0.5, 3));
        //console.log("*!*!*!*!*!*!*!*!*STRINGIFICATION: " + JSON.stringify(BABYLON.SceneSerializer.Serialize(this.scene)));

        //console.log("*!*!*!*!*!*!*!*!*STRINGIFICATION: " + JSON.stringify(BABYLON.SceneSerializer.SerializeMesh(this.leftHand)));
        //JSON.stringify(BABYLON.SceneSerializer.SerializeMesh(this.leftHand));
        //var testVec = new Vector3(1, 2, 3);
        ////console.log("stringify: " + JSON.stringify(testVec));
        //console.log("parse: " + (<Vector3>JSON.parse(JSON.stringify(testVec))));
        //var textVec2: Vector3 = JSON.parse(JSON.stringify(testVec));
        //console.log("textvec2: " + textVec2._x);
        //console.log("keys: " + Object.keys(textVec2));

        var cube = MeshBuilder.CreateBox("cube", { size: 1 }, this.scene);
        cube.position = new Vector3(1, 8, 1);
        var stringified = JSON.stringify(SceneSerializer.SerializeMesh(cube));
        //console.log("stringify cube: " + JSON.stringify(SceneSerializer.SerializeMesh(cube)));
        SceneLoader.ImportMesh("", "", ("data:" + stringified), this.scene);
        var cubeParse = JSON.parse(JSON.stringify(SceneSerializer.SerializeMesh(cube)));
        console.log(Object.getOwnPropertyNames(cubeParse));


        //var obj = {
        //    propA: 1,
        //    propB: "hello",
        //    propC: new Vector3(4, 5, 6)
        //};

        ////console.log("obj: " + obj);
        //var pso = JSON.parse(JSON.stringify(obj));
        //console.log("stringify obj: " + JSON.stringify(obj));
        //console.log("parse string obj: " + JSON.parse(JSON.stringify(obj)));
        ////console.log("prop A + 1: " + ((+pso.propA) + 1));

        //var x: Vector3 = Object.assign(new Vector3(), pso.propC);
        //console.log("obj assign to vector: " + (x instanceof Vector3));




        // send a message
        //var message = {
        //    body: "hello",
        //    msgtype: "m.text"
        //};
        //this.client.sendEvent("!FQlzwKdCBFuEnQusdk:matrix.org", "m.room.message", message, "");

    }


    // The main update loop will be executed once per frame before the scene is rendered
    private update() : void
    {
        //if (this.xrCamera){
        //this.userPosition = this.xrCamera!.globalPosition.clone(); 
        //}
        //if (this.rightController){
        //this.rightPosition = this.rightController!.pointer.position.clone(); 
        //}
        //if (this.leftController){
        //this.leftPosition = this.leftController!.pointer.position.clone(); 
        //}

        this.processControllerInput();
    }

    private processControllerInput() {
        this.onRightSqueeze(this.rightController?.motionController?.getComponent("xr-standard-squeeze"));
    }

    private onRightSqueeze(component?: WebXRControllerComponent) {
        if (component?.changes.pressed) {
            if (component?.pressed) {
                var newMesh = MeshBuilder.CreateBox("cube", { size: 1 }, this.scene);
                newMesh.position = new Vector3(2, 3, 4);
                this.envObjects.set(newMesh.name, newMesh);

                var message = {
                    status: "create",
                    type: "box",
                    id: newMesh.name,
                    info: {
                        position: newMesh.position,
                        rotation: newMesh.rotation,
                        opts: {
                            size: 1
                        }
                    }
                };

                Messages.sendMessage(false, JSON.stringify(message));
            }
        }
    }

    // updates environment according to message received from room
    // creates a cube if the message was 'cube' and a sphere if message was 'sphere'
    // mostly just testing things at this point, the real thing is going to be way more complicated
    private updateEnv(message: string) {
        console.log("message: " + message);
        var msg = JSON.parse(message);
        var msgInfo = JSON.parse(msg.info);
        switch (msg.status) {
            case "create":
                switch (msg.type) {
                    case "box":
                        var newMesh = MeshBuilder.CreateBox(msg.id, JSON.parse(msgInfo.opts), this.scene);
                        newMesh.position = Object.assign(newMesh.position, msgInfo.position);
                        newMesh.rotation = Object.assign(newMesh.rotation, msgInfo.rotation);
                        this.envObjects.set(msg.id, newMesh);
                        break;
                    case "sphere":
                        break;
                    default:
                        console.log("shape not matched");
                }
                break;
            case "update":
                break;
            case "remove":
                break;
        }

        ////console.log("update found: " + message);
        //if (message == "cube") {
        //    console.log("create a cube!");
        //    var cube = MeshBuilder.CreateBox("cube", { "size": 1 }, this.scene);
        //    cube.position = new Vector3(3, 1.5, 0);
        //} else if (message == "sphere") {
        //    console.log("create a sphere!");
        //    var sphere = MeshBuilder.CreateSphere("sphere", { diameter: 1 }, this.scene);
        //    sphere.position = new Vector3(0, 1.5, -3);
        //}

        //else if (message.startsWith("user")){
        //    console.log('this is the message that will be used to update environment'); 
        //    console.log(message); 
        //}
    }

    private async connect(user: string, pass: string) {
        // login
        await this.client.login("m.login.password", { user: user, password: pass }).then((response: any) => {
            console.log("logged in!");

            //var user_array = []
            //user_array.push(this.leftPosition);
            //user_array.push(this.rightPosition); 
            //user_array.push(this.userPosition); 

            // add user info to chat to update other info 
            //const user_info = {
            //    "body": "user " + user + " user_array: " + user_array,
            //    "msgtype": "m.text"
            //};
            //this.client.sendEvent(this.room, "m.room.message", user_info, "", (err:any, res:any) => {
            //    console.log(err);
            //});

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
            this.loginStatus!.dispose(false, true);

            // create self user object
            this.userObj = new User(this.user);
            //console.log("head pos: " + this.xrCamera?.position + " left controller: " + this.leftController + " right controller: " + this.rightController);
        });

        // add message listener to room - don't listen to messages in other rooms
        this.client.on("Room.timeline", (event: any, room: any, toStartOfTimeline: any) => {
            if (room.roomId == this.room) {
                //console.log(event.event.content.body);
                //console.log("room: " + room.roomId);

                // send messages to function to check if it's an update message
                if (event.event.type == 'm.room.message') {
                    this.updateEnv(event.event.content.body);
                    console.log("body: " + event.event.content.body);
                    var body = JSON.parse(event.event.content.body);

                    if (body.status == "update") {
                        console.log("update type, print content: " + body.content);
                        var obj = JSON.parse(body.content);
                        console.log("print user: " + obj.id);
                        console.log("print hpos: " + obj.hpos);
                    }
                }
            }
        });

        //Messages.setClient(this.client);
        //Messages.getClient();

        // add message sender 
        //const content = {
        //    "body": user + " has been added",
        //    "msgtype": "m.text"
        //};

        //this.client.sendEvent(this.room, "m.room.message", content, "", (err:any, res:any) => {
        //    console.log(err);
        //});
    }
}
/******* End of the Game class ******/



// used for storing and sharing the environment state
//class State {

//    //// all users in environment, mapped to their usernames
//    //private users: Map<string, Object>;

//    //// all objects in environment, mapped to their names
//    //private items: Map<string, AbstractMesh>;

//    // should theoretically contain both users and items
//    private objects: Map<string, Object>;

//    constructor() {
//        //users = new Map();
//        //items = new Map();
//        this.objects = new Map();
//    }

//    // receive update for an object passed as a JSON string
//    receiveUpdate(info: string) {
//        //var parsedInfo = JSON.parse(info);
//        //var foundItem = this.objects.get(info.id);
//        //if (foundItem) {
//        //    foundItem.update(parsedInfo.info);
//        //} else {
//        //    var objInfo = JSON.parse(parsedInfo.info);
//        //    console.log("num keys for object: " + Object.keys(objInfo).length);
//        //    if (Object.keys(objInfo).length == 4) {
//        //        this.objects.add(new User(info.id))
//        //    } else {
//        //        this.objects.add(new Item(info.id, parsedInfo.info));
//        //    }
//    }

//    sendUpdate(id: string) {

//    }

//    //public toString() : string {
//    //    return "";
//    //}
//}

// represent users
class User {

    // username
    private user: string;

    // visualize headset and controllers 
    private head: AbstractMesh;
    private left: AbstractMesh;
    private right: AbstractMesh;

    constructor(user: string, head: Vector3 = new Vector3(0, 0, 0), headRotation: Vector3 = new Vector3(0, 0, 0),
                                            left: Vector3 = new Vector3(0, 0, 0), right: Vector3 = new Vector3(0, 0, 0)) {
        this.user = user;
        this.head = MeshBuilder.CreateBox((user + "_head"), { size: 0.3 });
        this.head.position = head;
        this.head.rotation = headRotation;
        this.left = MeshBuilder.CreateSphere((user + "_left"), { segments: 16, diameter: 0.1 });
        this.left.position = left;
        this.right = MeshBuilder.CreateSphere((user + "_right"), { segments: 16, diameter: 0.1 });
        this.right.position = right;

        this.move(head, headRotation, left, right);
    }

    public move(head: Vector3, headRotation: Vector3, left: Vector3, right: Vector3) {
        this.head.position = head;
        this.head.rotation = headRotation;
        this.left.position = left;
        this.right.position = right;

        var content = {
            type: "update",
            content: this.toString()
        };

        Messages.sendMessage(false, JSON.stringify(content));
    }

    public remove() {
        this.head.dispose();
        this.left.dispose();
        this.right.dispose();

        var content = {
            type: "remove",
            content: this.user
        };

        Messages.sendMessage(false, JSON.stringify(content));
    }

    public update(info: string) {
        var obj = JSON.parse(info);

        Object.assign(this.head.position, obj.hpos);
        Object.assign(this.head.rotation, obj.hrot);
        Object.assign(this.left.position, obj.lpos);
        Object.assign(this.right.position, obj.rpos);
    }

    // return JSON string
    public toString() {
        var ret = {
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


class Item {

    //private id: string;
    ////private mesh: AbstractMesh;

    //// pass in ID and options for meshbuilder
    ////constructor(id: string, opts: string) {
    ////    this.id = id;
    ////    var type = id.split("_")[0];
    ////    //switch (type) {
    ////    //    case "box":
    ////    //        this.mesh = MeshBuilder.CreateBox(id, )
    ////    //}
    ////}


    //constructor(createInfo: string) {
    //    var parsedInfo: 4
    //}

    //public update(info: string) {

    //}
}

// start the game
var game = new Game();
game.start();