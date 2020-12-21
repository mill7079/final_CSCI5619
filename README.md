# Final Project

**Due: Sunday, December 20, 11:59pm CDT**

Only one person per team needs to submit the project.  Your submission for milestone 2 (implementation) should include the following deliverables:

- All source code and required libraries for your project.
- Detailed documentation in a readme markdown file, similar to the documentation provided with the assignments. 

*Note that your milestone 2 grade will be partially based upon the completeness of this documentation!*

## Submission Information

You should fill out this information before submitting your project.  

IMPORTANT NOTE: the official repository should be found here: https://github.com/mill7079/final_CSCI5619

**Team Members**

Allison Miller - mill7079@umn.edu  
Angel Sylvester - sylve057@umn.edu

**Project Description**

This should include a brief descriptions of the work you performed (what specifically you built) and your development environment. You may also include screenshots or pictures of your implementation working, where appropriate.  

Our project is a multi-user VR environment build in Babylon.JS using Matrix to facilitate communication and environment synchronization between users. The project features the ability of the user to conjure meshes, changing their texture, moving them, and deleting them through the usage of ray casting and spatially triggered widgets on the user's wrist when a object is selected. The updates an individual user makes locally will be propagated through the Matrix framework to other users through the usage of message updates that possess information regarding the status of an environment, from which other user environment can use to keep their respective environments up to date. In addition, user avatars were included who's respective positions get updated with each message sent from that local environment. 

**Instructions**

Provide instructions for how to use your project and test the various features that you implemented.  This is important to make sure the instructor/TA does not miss anything when grading your project.

To enter the shared environment, users will first need to sign up for an account with Matrix [here](https://app.element.io/?pk_vid=27b4a145cdc9a56a1608421273a6b805#/register). Afterwards, that user should be able to enter the virtual environment. Upon entering the environment, you will be prompted to log in - enter your Matrix username in the top bar, press the enter button on the virtual keyboard, enter your password, and press the enter button again. If you entered your credentials correctly, the program will begin logging you in and performing the initial environment sync; if not, you will be re-prompted for your login information.  

Once in the environment, you'll be able to see other users and objects that those users have created. Due to network rate limitations on the Matrix server and the overhead of the chat room, movement of users and objects is not portrayed in real time, but instead is updated when users perform actions, such as teleporting or moving an object. To disguise this issue, updates in movement include an array of positions and rotations each object possess every 20 frames until the user releases that object. As a result, other users should still be able to view a seamless movement of an environment mesh. 

To move around in the environment, press the right thumbstick forward to begin teleporting. A cone will appear on the ground to indicate your future position and direction (the direction the cone is pointing indicates the direction). To adjust the direction the cone is pointing, rotate the left controller.  

In order to generate a random geometric mesh, the user must press on the right grip button. To interact with existing objects, point one of your controllers at an object and hold the trigger button on that controller to move it around. Only one user can interact with each object at a time; if another user is already interacting with an object, it will be highlighted with the color of that user, and other users will not be able to select it. Release the trigger button to release the object. 

While holding the object, a couple widgets will appear around the hand that is controlling the object - interact with these by grabbing them (pressing the grip button when the controller mesh intersects with one of the widgets) with the opposite hand, pulling them away from your wrist, and releasing them. The red sphere will destroy the currently selected object, and the blue cube will allow you to select from a few preset textures to apply to the object.

**Build URL**

For Babylon.js projects, you should include a link to a deployed build on a University web server, similar to the programming assignments.  

For Unity projects, please provide a downloadable link to the APK file of your project that we can install using SideQuest.  If you are using Google Drive, make sure that the sharing settings are set correctly to allow us to download the file.

Build URL: https://www-users.cselabs.umn.edu/~mill7079/Final/

**Third Party Assets**

Make sure to document the name and source of any third party assets such as 3D models, textures, or any other content used that was not solely written by you.  Include sufficient detail for the instructor or TA to easily find them, such as asset store or download links.  

You should also include links to any 3rd party libraries or code that you used.  If you use code written by others, be especially clear to indicate which code you actually wrote.  

*Be aware that points will be deducted for using third party assets that are not properly documented.*
  
[Matrix JS SDK](https://www.npmjs.com/package/@types/matrix-js-sdk)  
[TypeScript types for Matrix JS SDK](https://www.npmjs.com/package/@types/matrix-js-sdk)  
[Rainbow Swirl Tie Dye](https://craftychica.com/2015/07/rainbow-swirl-tie-dye/) from craftychica.com  
[Black Grunge Wall](https://freestocktextures.com/texture/black-grunge-wall,1304.html) from freestocktextures.com  
[Abstract Stroke Mask](https://freestocktextures.com/texture/abstract-stroke-mask,1290.html) from freestocktextures.com  
[Violet Spring Flowers](
https://freestocktextures.com/texture/violet-spring-flowers,1324.html) from freestocktextures.com  


## License

Material for [CSCI 5619 Fall 2020](https://canvas.umn.edu/courses/194179) by [Evan Suma Rosenberg](https://illusioneering.umn.edu/) is licensed under a [Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International License](http://creativecommons.org/licenses/by-nc-sa/4.0/).

The intent of choosing CC BY-NC-SA 4.0 is to allow individuals and instructors at non-profit entities to use this content.  This includes not-for-profit schools (K-12 and post-secondary). For-profit entities (or people creating courses for those sites) may not use this content without permission (this includes, but is not limited to, for-profit schools and universities and commercial education sites such as Coursera, Udacity, LinkedIn Learning, and other similar sites).   

## Acknowledgments

This assignment was partially based upon content from the [3D User Interfaces Fall 2020](https://github.blairmacintyre.me/3dui-class-f20) course by Blair MacIntyre.
