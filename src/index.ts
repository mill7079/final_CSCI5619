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

    private client: any;
    private user = "";
    private password = "";

    private gameState: State;

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

        // create client on server
        this.client = MATRIX.createClient("https://matrix.org");

        // debugging
        //console.log("domain " + this.client.getHomeserverUrl());

        this.gameState = new State();
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
            if(inputSource.uniqueId.endsWith("right"))
            {
                this.rightController = inputSource;
            }
            else 
            {
                this.leftController = inputSource;
            }  
        });

        // Don't forget to deparent objects from the controllers or they will be destroyed!
        xrHelper.input.onControllerRemovedObservable.add((inputSource) => {

            if(inputSource.uniqueId.endsWith("right")) 
            {

            }
        });

        this.scene.debugLayer.show();


        // Matrix connection stuff

        // debugging
        //await this.client.publicRooms(function (err: any, data: any) {
        //    if (err) {
        //        console.error("err %s", JSON.stringify(err));
        //        //return;
        //    }
        //    console.log("Public Rooms: %s", JSON.stringify(data));
        //});

        // log in
        await this.client.login("m.login.password", { user: this.user, password: this.password }).then((response: any) => {
            console.log("logged in!");
            //console.log("access token : " + response.access_token);
        });

        // start client
        await this.client.startClient({ initialSyncLimit: 10 });

        // sync client
        // source of many errors - if you need to do something that requires the client to be synced, just put the code in the callback
        // no idea how to wait for it to finish so it's always the last thing to print
        var c = this.client;
        await this.client.once('sync', function (state: any, prevState: any, res: any) {
            console.log("prev state: " + prevState);
            console.log("state: " + state); // state will be 'PREPARED' when the client is ready to use

            //var room = c.getRoom("!FQlzwKdCBFuEnQusdk:matrix.org");
            //if (room) {
            //    console.log("roomy room: " + room.name);
            //}
            //else {
            //    console.log("not synced");
            //}
            //console.log("get sync state: " + c.getSyncState());

            //Object.keys(c.store.rooms).forEach((roomId: string) => {
            //    c.getRoom(roomId).timeline.forEach((t: any) => {
            //        //console.log(t.event);
            //        console.log(t.getContent());
            //    });
            //});
        });

        // add an event listener to get past messages and listen for new ones
        // using 'this' only works in this specific formatting (with the arrow function) because javascript sucks
        // beware: will get all messages from all rooms you've joined 
        this.client.on("Room.timeline", (event:any, room:any, toStartOfTimeline:any) => {
            console.log(event.event.content.body);

            // send messages to function to check if it's an update message
            if (event.event.type == 'm.room.message') {
                this.updateEnv(event.event.content.body);
            }
        });


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
            sphere.position = new Vector3(0, 1.5, 3);
        }
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