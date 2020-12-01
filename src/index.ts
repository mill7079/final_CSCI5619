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
    private clientState = "";

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
        //this.client = MATRIX.createClient("https://matrix.tchncs.de");
        this.client = MATRIX.createClient("https://matrix.org");

        // debugging
        console.log("domain " + this.client.getHomeserverUrl());

        // join a room
        //this.client.joinRoom("#5619final:matrix.org");
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

            //this.client.joinRoom("#5619final:matrix.org");
            //this.client.joinRoom("!FQlzwKdCBFuEnQusdk:matrix.org");

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
        // do we need this?
        //await this.client.startClient({ initialSyncLimit: 10 });


        // log in
        //this.client.loginWithPassword(this.user, this.password);

        // join a room

        // find room id?? theoretically?
        //var id = await this.client.getRoomIdForAlias("#5619final:matrix.org");
        //console.log("id: " + id.roomId);


        await this.client.publicRooms(function (err: any, data: any) {

            if (err) {
                console.error("err %s", JSON.stringify(err));
                //return;
            }

            console.log("Public Rooms: %s", JSON.stringify(data));
        });

        await this.client.login("m.login.password", { user: this.user, password: this.password }).then((response: any) => {
            console.log("logged in!");
            //console.log("access token : " + response.access_token);
        });

        await this.client.startClient();

        var rooms = this.client.getRooms();
        console.log("rooms: " + rooms.length);
        rooms.forEach((room: any) => {
            console.log(room.roomId);
        });
    }

    // The main update loop will be executed once per frame before the scene is rendered
    private update() : void
    {

    }

}
/******* End of the Game class ******/   

// start the game
var game = new Game();
game.start();