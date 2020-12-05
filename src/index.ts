/* CSCI 5619 Final, Fall 2020
 * Author: Evan Suma Rosenberg
 * License: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International
 */ 

import { Engine } from "@babylonjs/core/Engines/engine"; 
import { Scene } from "@babylonjs/core/scene";
import { Vector3, Color3 } from "@babylonjs/core/Maths/math";
import { UniversalCamera } from "@babylonjs/core/Cameras/universalCamera";
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
import * as MATRIX from "matrix-js-sdk"

// Side effects
import "@babylonjs/core/Helpers/sceneHelpers";
import "@babylonjs/inspector";

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

    private guiPlane: AbstractMesh | null;
    private loginStatus: AbstractMesh | null;
    private black = "#070707";
    private gray = "#808080";

    private gameState: State;

    private userPosition: Vector3 | null; 
    private leftPosition: Vector3 | null;
    private rightPosition: Vector3 | null;

    private loginSuccess: Boolean | null; 

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
        this.leftHand = MeshBuilder.CreateSphere("leftHand", { diameter: 0.1 }, this.scene);
        this.rightHand = MeshBuilder.CreateSphere("rightHand", { diameter: 0.1 }, this.scene);
        this.leftHand.isPickable = false;
        this.leftHand.isVisible = false;
        this.rightHand.isPickable = false;
        this.rightHand.isVisible = false;

        // set up positions 
        this.userPosition = null; 
        this.leftPosition = null; 
        this.rightPosition = null; 

        // create client on server
        this.client = MATRIX.createClient("https://matrix.org");

        this.guiPlane = null;
        this.loginStatus = null;

        // debugging
        //console.log("domain " + this.client.getHomeserverUrl());

        this.gameState = new State();
        this.loginSuccess = false; 
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

        this.scene.debugLayer.show();

                // create login gui
        //var guiPlane = MeshBuilder.CreatePlane("guiPlane", {}, this.scene);
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
                        console.log(this.user, inputPass.text);
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

        if (!this.loginSuccess){
            loginMesh.removeControl(loggingIn); 
            var failedLogin = new TextBlock();
            failedLogin.text = "Log in failed .. please reload";
            failedLogin.color = "white";
            failedLogin.fontSize = 32;
            failedLogin.textHorizontalAlignment = TextBlock.HORIZONTAL_ALIGNMENT_CENTER;
            failedLogin.textVerticalAlignment = TextBlock.VERTICAL_ALIGNMENT_CENTER;
            loginMesh.addControl(failedLogin);
        }


        // Matrix connection stuff

        // debugging
        //await this.client.publicRooms(function (err: any, data: any) {
        //    if (err) {
        //        console.error("err %s", JSON.stringify(err));
        //        //return;
        //    }
        //    console.log("Public Rooms: %s", JSON.stringify(data));
        //});



        // the following is theoretically done by the connect function now

        ////log in
        //await this.client.login("m.login.password", { user: this.user, password: this.password }).then((response: any) => {
        //    console.log("logged in!");
        //    //console.log("access token : " + response.access_token);
        //});

        //// start client
        //await this.client.startClient({ initialSyncLimit: 10 });

        // sync client
        // source of many errors - if you need to do something that requires the client to be synced, just put the code in the callback
        // no idea how to wait for it to finish so it's always the last thing to print
        //var c = this.client;
        //await this.client.once('sync', function (state: any, prevState: any, res: any) {
        //    console.log("prev state: " + prevState);
        //    console.log("state: " + state); // state will be 'PREPARED' when the client is ready to use

        //    //var room = c.getRoom("!FQlzwKdCBFuEnQusdk:matrix.org");
        //    //if (room) {
        //    //    console.log("roomy room: " + room.name);
        //    //}
        //    //else {
        //    //    console.log("not synced");
        //    //}
        //    //console.log("get sync state: " + c.getSyncState());

        //    //Object.keys(c.store.rooms).forEach((roomId: string) => {
        //    //    c.getRoom(roomId).timeline.forEach((t: any) => {
        //    //        //console.log(t.event);
        //    //        console.log(t.getContent());
        //    //    });
        //    //});
        //});

        // add an event listener to get past messages and listen for new ones
        // using 'this' only works in this specific formatting (with the arrow function) because javascript sucks
        // beware: will get all messages from all rooms you've joined 
        //this.client.on("Room.timeline", (event:any, room:any, toStartOfTimeline:any) => {
        //    console.log(event.event.content.body);

        //    // send messages to function to check if it's an update message
        //    if (event.event.type == 'm.room.message') {
        //        this.updateEnv(event.event.content.body);
        //    }
        //});






        // send a message
        //var message = {
        //    body: "hello",
        //    msgtype: "m.text"
        //};
        //this.client.sendEvent("!FQlzwKdCBFuEnQusdk:matrix.org", "m.room.message", message, "");

    }

    private createLoginGUI(){
    }


    // The main update loop will be executed once per frame before the scene is rendered
    private update() : void
    {
        if (this.xrCamera){
        this.userPosition = this.xrCamera!.globalPosition.clone(); 
        }
        if (this.rightController){
        this.rightPosition = this.rightController!.pointer.position.clone(); 
        }
        if (this.leftController){
        this.leftPosition = this.leftController!.pointer.position.clone(); 
        }

    }

    // updates environment according to message received from room
    // creates a cube if the message was 'cube' and a sphere if message was 'sphere'
    // mostly just testing things at this point, the real thing is going to be way more complicated
    private updateEnv(message: string) {

        console.log("update found: " + message);
        if (message == "cube") {
            console.log("create a cube!");
            var cube = MeshBuilder.CreateBox("cube", { size: 1 }, this.scene);
            cube.position = new Vector3(3, 1.5, 0);
        } else if (message == "sphere") {
            console.log("create a sphere!");
            var sphere = MeshBuilder.CreateSphere("sphere", { diameter: 1 }, this.scene);
            sphere.position = new Vector3(0, 1.5, -3);
        }

        else if (message.startsWith("user")){
            console.log('this is the message that will be used to update environemt'); 
            console.log(message); 
        }
    }

    private async connect(user: string, pass: string) {
        // login
        await this.client.login("m.login.password", { user: user, password: pass }).then((response: any) => {
            console.log("logged in!");

            var user_array = []
            user_array.push(this.leftPosition);
            user_array.push(this.rightPosition); 
            user_array.push(this.userPosition); 

            // add user info to chat to update other info 
            const user_info = {
                "body": "user " + user + " user_array: " + user_array,
                "msgtype": "m.text"
            };
            this.client.sendEvent("!FQlzwKdCBFuEnQusdk:matrix.org", "m.room.message", user_info, "", (err:any, res:any) => {
                console.log(err);
            });

            this.loginSuccess = true; 


        }).catch((err: any) => {
            console.log("error logging in user " + user);
            this.loginSuccess = false; 
            return;
        });

        if (this.guiPlane){
        this.guiPlane!.dispose(false, true);
        }

        // start client
        await this.client.startClient({ initialSyncLimit: 10 });

        // sync client - hopefully finishes before sync is needed
        //await this.client.once('sync', function (state: any, prevState: any, res: any) {
        //    console.log("client state: " + state); // state will be 'PREPARED' when the client is ready to use
            
        //});
        await this.client.once('sync', (state: any, prevState: any, res: any) => {
            console.log("client state: " + state); // state will be 'PREPARED' when the client is ready to use
            this.loginStatus!.dispose(false, true);
        });

        // add message listener
        this.client.on("Room.timeline", (event: any, room: any, toStartOfTimeline: any) => {
            //console.log(event.event.content.body);

            // send messages to function to check if it's an update message
            if (event.event.type == 'm.room.message') {
                this.updateEnv(event.event.content.body);
            }
        });

        // add message sender 
        const content = {
            "body": user + " has been added",
            "msgtype": "m.text"
        };

        this.client.sendEvent("!FQlzwKdCBFuEnQusdk:matrix.org", "m.room.message", content, "", (err:any, res:any) => {
            console.log(err);
        });
    }
}
/******* End of the Game class ******/



// used for storing and sharing the environment state...maybe
class State {
    // still....working out how to communicate these
    //private users: Vector3[][]; // list of users in terms of position (headset/left/right)
    //private objects: AbstractMesh[] = []; // list of environment objects (shape/options/position...etc?)
    constructor() {
    }

    public toString() : string {
        return "";
    }
}


// start the game
var game = new Game();
game.start();