// Dependencies
var http = require("http");
var path = require("path");
var express = require("express");
var socketIO = require("socket.io");
var app = express();
var server = http.Server(app);
var io = socketIO(server);
app.set("port", 5000);
app.use("/dist", express.static(__dirname + "/dist"));

// Routing
app.get("/", (request, response) => {
  response.sendFile(path.join(__dirname, "dist/index.html"));
});

// Start the server
server.listen(5000, () => {
  console.log("Starting server on port 5000");
}); 

var Terrain = {
    TREE: "tree",
}

var projectileSpeed = 12; 
var maxProjDist = 1600;
var renderSize = 4;

var projectileWidth = 2;
var projectileHeight = 0.5;
var projectileHitBoxRadius = 1;
var baseProjectileDamage = 10;

var playerSpeed = 3;
var playerHealth = 100;
var playerWidth = 4;
var playerHeight = 6;
var teamColors = ["#FF0000", "#00FF00", "#0000FF"];

var gravestoneWidth = 3;
var gravestoneHeight = 4;
var gravestoneHitboxWidth = gravestoneWidth;
var gravestoneHitboxHeight = gravestoneHeight;
var gravestoneHealth = 40;

var treeWidth = 4;
var treeHeight = 8;
var treeHitboxWidth = 4;
var treeHitboxHeight = 8;
var treeHealth = 200;

// Listen for connection on IO
var objects = {};

// Adds starting resources to the map
initializeMap(objects);

io.on("connection", (socket) => {
    // Handle connection
    socket.on("new-player", () => {
        var newPlayerTeam = Math.floor(Math.random() * (teamColors.length))
        objects[socket.id] = {
            type: "player",
            x: 0,
            y: 0,
            velocityX: 0,
            velocityY: 0,
            speed: playerSpeed,
            width: playerWidth,
            height: playerHeight,
            hitboxWidth: playerWidth - 2,
            hitboxHeight: playerHeight,
            health: playerHealth,
            maxHealth: playerHealth,
            team: newPlayerTeam,
            teamColor: teamColors[newPlayerTeam],
        };
        socket.emit("handshake", {
            id: socket.id,
            cubeSize: renderSize,
        });
    });

    // Handle player movement event
    socket.on("playerInput", (playerInput) => {
        var player = objects[socket.id] || {};
        if (playerInput.left) {
            if (playerInput.right) {
                player.velocityX = 0;
            } else {
                player.velocityX = -player.speed;
            }
        } else if (playerInput.right) {
            player.velocityX = player.speed;
        } else {
            player.velocityX = 0;
        }

        if (playerInput.up) {
            if (playerInput.down){
                player.velocityY = 0;
            } else {
                player.velocityY = -player.speed;
            }
        } else if (playerInput.down) {
            player.velocityY = player.speed;
        } else {
            player.velocityY = 0;
        }
    });

    // Handle mouse down event from player
    socket.on("mouseDown", (object) => {
        if (objects[object.sourceId].type == "player") {
            var angle = Math.atan2(
                object.targetY - objects[object.sourceId].y,
                object.targetX - objects[object.sourceId].x);
        
            // Generate unique Id for new projectile
            var newId = object.sourceId.concat(":", object.targetX, ":", object.targetY);
            var dup = 0;
            while (objects[newId.concat(":" + dup)]){
                dup++;
            }
            
            objects[newId.concat(":" + dup)] = {
                type: "projectile",
                source: object.sourceId,
                x: objects[object.sourceId].x,
                y: objects[object.sourceId].y,
                velocityX: Math.cos(angle) * projectileSpeed,
                velocityY: Math.sin(angle) * projectileSpeed,
                width: projectileWidth,
                height: projectileHeight,
                hitboxWidth: projectileHitBoxRadius,
                hitboxHeight: projectileHitBoxRadius,
                facing: angle * 180 / Math.PI,
                dist: 0,
                damage: baseProjectileDamage,
            }
        }
    });

    // Handle player disconnect - Clean up resources 
    socket.on("disconnect", () => {
        delete objects[socket.id];
    });
});

// Main update loop at 60fps
setInterval(() => {
    for (var id in objects) {
        switch (objects[id].type) {
            case "player":
                // Calculate player movement
                objects[id].x += objects[id].velocityX;
                objects[id].y += objects[id].velocityY;

                // Check collisions with terrain and reposition accordingly
                checkCollisions(id, objects, (srcId, collisionId) => {
                    if (objects[srcId] && collisionId != srcId){
                        switch (objects[collisionId].type) {
                            case "terrain":
                                // Push object back out of collision terrain towards which ever side is the closest to the terrain object
                                var distRight = Math.abs((objects[collisionId].x - objects[collisionId].width * renderSize / 2) - (objects[srcId].x + objects[srcId].hitboxWidth * renderSize / 2));
                                var distLeft =  Math.abs((objects[collisionId].x + objects[collisionId].width * renderSize / 2) - (objects[srcId].x - objects[srcId].hitboxWidth * renderSize / 2));
                                var distUp =    Math.abs((objects[collisionId].y + objects[collisionId].height * renderSize / 2) - (objects[srcId].y - objects[srcId].hitboxHeight * renderSize / 2));
                                var distDown =  Math.abs((objects[collisionId].y - objects[collisionId].height * renderSize / 2) - (objects[srcId].y + objects[srcId].hitboxHeight * renderSize / 2));
                                
                                if (distRight < distLeft && distRight < distUp && distRight < distDown) {
                                    objects[srcId].x = objects[srcId].x - distRight;
                                } else if (distLeft < distRight && distLeft < distUp && distLeft < distDown) {
                                    objects[srcId].x = objects[srcId].x + distLeft;
                                } else if (distUp < distRight && distUp < distLeft && distUp < distDown) {
                                    objects[srcId].y = objects[srcId].y + distUp;
                                } else if (distDown < distRight && distDown < distLeft && distDown < distUp) {
                                    objects[srcId].y = objects[srcId].y - distDown;
                                }
                                break;
                        }
                    }
                });

                break;
            case "projectile":
                // Calculate projectile movement
                objects[id].x += objects[id].velocityX;
                objects[id].y += objects[id].velocityY;
                objects[id].dist += Math.sqrt(
                    Math.pow(objects[id].velocityX, 2) +
                    Math.pow(objects[id].velocityY, 2));

                checkCollisions(id, objects, (srcId, collisionId) => {
                    if (objects[srcId] && collisionId != srcId && collisionId != objects[srcId].source){
                        switch (objects[collisionId].type) {
                            case "player":
                                objects[collisionId].health -= objects[srcId].damage;
                                delete objects[srcId];

                                // TODO: Move player death calculations out of here
                                // Add deathrattle function to object definitions
                                if (objects[collisionId].health <= 0){
                                    // Don't bother changing the values like this... Just reset the object
                                    objects[collisionId].type = "gravestone";
                                    objects[collisionId].y = objects[collisionId].y + 1 * renderSize;
                                    objects[collisionId].width = gravestoneWidth;
                                    objects[collisionId].height = gravestoneHeight;
                                    objects[collisionId].hitboxWidth = gravestoneHitboxWidth;
                                    objects[collisionId].hitboxHeight = gravestoneHitboxHeight;
                                    objects[collisionId].maxHealth = gravestoneHealth;
                                    objects[collisionId].health = objects[collisionId].maxHealth;
                                }
                                break;
                            case "gravestone":
                                objects[collisionId].health -= objects[srcId].damage;
                                delete objects[srcId];

                                // TODO: Move gravestone death calculations out of here
                                if (objects[collisionId].health <= 0){
                                    // Player respawns on gravestone death
                                    objects[collisionId].type = "player";
                                    objects[collisionId].x = 0;
                                    objects[collisionId].y = 0;
                                    objects[collisionId].velocityX = 0;
                                    objects[collisionId].velocityY = 0;
                                    objects[collisionId].width = playerWidth;
                                    objects[collisionId].height = playerHeight;
                                    objects[collisionId].hitboxWidth = playerWidth - 2;
                                    objects[collisionId].hitboxHeight = playerHeight;
                                    objects[collisionId].maxHealth = 100;
                                    objects[collisionId].health = 100;
                                }
                            case "terrain":
                                objects[collisionId].health -= objects[srcId].damage;
                                delete objects[srcId];

                                if (objects[collisionId].health <= 0){
                                    delete objects[collisionId];
                                }
                                break;
                        }
                    }
                });
                if (objects[id]) {
                    if (objects[id].dist > maxProjDist) {
                        delete objects[id];
                    }
                }
                break;
        }
    }

    io.sockets.emit("state", objects);
}, 1000 / 60);

// Check collisions between all objects
function checkCollisions(checkSrc, obs, callBack) {
    var src = obs[checkSrc];

    for (id in obs) {
        var check = obs[id];

        var xIn = valueInRange(src.x - src.hitboxWidth / 2 * renderSize, check.x - check.hitboxWidth / 2 * renderSize, check.x + check.hitboxWidth / 2 * renderSize) ||
            valueInRange(src.x + src.hitboxWidth / 2 * renderSize, check.x - check.hitboxWidth / 2 * renderSize, check.x + check.hitboxWidth / 2 * renderSize);

        var yIn = valueInRange(src.y - src.hitboxHeight / 2 * renderSize, check.y - check.hitboxHeight / 2 * renderSize, check.y + check.hitboxHeight / 2 * renderSize) ||
            valueInRange(src.y + src.hitboxHeight / 2 * renderSize, check.y - check.hitboxHeight / 2 * renderSize, check.y + check.hitboxHeight / 2 * renderSize);

        if (xIn && yIn) callBack(checkSrc, id);
    }
}

// Collision detection helper, checks if value is between min and max
function valueInRange(value, min, max) { 
    return (value >= min) && (value <= max); 
}

// Initializes starting map resources
function initializeMap(obs) {
    obs["init:tree:200:200"] = generateNewTerrain(200, 200, Terrain.TREE);
    obs["init:tree:-200:200"] = generateNewTerrain(-200, 200, Terrain.TREE);
    obs["init:tree:200:-200"] = generateNewTerrain(200, -200, Terrain.TREE);
    obs["init:tree:-200:-200"] = generateNewTerrain(-200, -200, Terrain.TREE);
}

function generateNewTerrain(posX, posY, subtype) {
    switch (subtype) {
        case Terrain.TREE:
            return {
                type: "terrain",
                subtype: subtype,
                x: posX,
                y: posY,
                width: treeWidth,
                height: treeHeight,
                hitboxWidth: treeHitboxWidth,
                hitboxHeight: treeHitboxHeight,
                health: treeHealth,
                maxHealth: treeHealth,
            }
            break;
    }
}
