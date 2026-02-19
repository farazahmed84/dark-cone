# DARK CONE
## Game Design Document (AI-Agent Implementation Spec)
Version: 1.0
Engine: Phaser 3
Target Platform: Web (Desktop Browser)
Visual Style: 1-bit (Black and White only)
Camera: Top-down
Scope: Single level, highly polished
Session Length: 3 to 6 minutes

---

# 1. HIGH CONCEPT

The player is trapped inside a strange maze-like facility. Darkness allows a hostile entity to move. The player uses a flashlight to reveal the world and freeze the entity, but the flashlight has limited battery.

The player must find a key first, then reach the exit while managing flashlight battery and avoiding the entity.

Core mechanic rule:

- Entity moves ONLY when NOT illuminated by flashlight.
- Flashlight drains battery while held.
- Flashlight recharges when released.
- Player must strategically use light to survive.

---

# 2. CORE GAMEPLAY LOOP

Loop sequence:

1. Player explores maze using flashlight.
2. Flashlight drains battery while held.
3. Player releases flashlight to recharge battery.
4. Entity moves toward player in darkness.
5. Player illuminates entity to freeze it.
6. Player finds key.
7. Player reaches exit.
8. Player wins.

Failure condition:
- Entity collides with player.

Win condition:
- Player collects key AND reaches exit.

---

# 3. CONTROLS

Desktop only.

Movement:
- W = move up
- A = move left
- S = move down
- D = move right

Flashlight:
- Hold LEFT MOUSE BUTTON to enable flashlight
- Release to disable flashlight

Flashlight direction:
- Always points toward mouse cursor

---

# 4. GAME WORLD SPECIFICATION

Grid-based tile world.

Tile size:
24 pixels

Map size:
25 x 25 tiles

World pixel size:
600 x 600 pixels

Tile types:
- floor (walkable)
- wall (collidable)
- exit (collidable until key collected)
- key (collectible)

World color rules:
- background: black (#000000)
- walls: white (#FFFFFF)
- player: white
- entity: white silhouette only when illuminated

---

# 5. PLAYER SPECIFICATION

Player properties:

position_x
position_y

movement_speed = 90 pixels per second

collision_body:
- circle radius = 8 pixels

Player rotation:
- always faces mouse cursor

Player cannot pass through walls.

---

# 6. FLASHLIGHT SYSTEM

Flashlight properties:

enabled = true only while mouse button held

battery_max = 100
battery_current = 100

battery_drain_rate = 25 per second
battery_recharge_rate = 10 per second

minimum_restart_threshold = 5

Flashlight geometry:

cone_radius = 220 pixels
cone_angle = 50 degrees total (25 degrees each side)

Flashlight logic:

If mouse held AND battery_current > minimum_restart_threshold:
    flashlight enabled
Else:
    flashlight disabled

If flashlight enabled:
    battery_current -= battery_drain_rate * delta_time

If flashlight disabled:
    battery_current += battery_recharge_rate * delta_time

Clamp battery_current between 0 and battery_max

If battery_current <= 0:
    flashlight forced disabled

---

# 7. VISIBILITY SYSTEM

Darkness overlay covers entire screen.

Flashlight cone cuts hole in darkness overlay using geometry mask.

Objects visible ONLY inside flashlight cone:

- entity silhouette
- full brightness walls and floor

Outside cone:
- world remains dark

---

# 8. ENTITY SPECIFICATION

Entity properties:

position_x
position_y

collision_body:
circle radius = 8 pixels

movement_speed = 55 pixels per second

state:
- HUNTING
- FROZEN

Initial spawn distance:
minimum 200 pixels away from player

Entity movement logic per frame:

If flashlight enabled AND entity inside cone AND line_of_sight_clear:
    state = FROZEN
    velocity = 0
Else:
    state = HUNTING
    direction = normalize(player_position - entity_position)
    velocity = direction * movement_speed

Entity collides with walls.

Entity cannot pass through walls.

If entity collision overlaps player:
    trigger Game Over

---

# 9. LINE OF SIGHT SYSTEM

Line of sight must be checked.

Procedure:

Cast ray from player center to entity center.

If ray intersects any wall collider:
    line_of_sight_clear = false

Else:
    line_of_sight_clear = true

Entity freezes ONLY if line_of_sight_clear = true.

---

# 10. KEY SYSTEM

Key properties:

position_x
position_y

collision_body:
circle radius = 8 pixels

Variable:
player_has_key = false

When player overlaps key:
    player_has_key = true
    destroy key object
    enable exit

---

# 11. EXIT SYSTEM

Exit properties:

position_x
position_y

collision_body:
rectangle 24x24 pixels

Exit initially locked.

Exit unlocks when:
player_has_key == true

When unlocked AND player overlaps exit:
trigger Win state

---

# 12. AUDIO SYSTEM

Audio loops:

ambient_loop:
always playing

footstep_loop:
playing ONLY when entity state == HUNTING

Footstep volume scaling:

distance = distance(player, entity)

If distance > 350:
volume = 0.1

If distance <= 350:
volume = linear_scale(distance, 350 to 0, 0.1 to 1.0)

Flashlight click sound:
play when flashlight turns ON or OFF

Low battery sound:
play when battery_current <= 20

---

# 13. GAME STATES

States:

BOOT
MENU
PLAYING
WIN
LOSE

State transitions:

BOOT -> MENU

MENU -> PLAYING

PLAYING -> WIN when player reaches exit with key

PLAYING -> LOSE when entity touches player

WIN -> MENU on input

LOSE -> MENU on input

---

# 14. PHASER SCENE STRUCTURE

Scenes:

BootScene
PreloadScene
MenuScene
GameScene
EndScene

GameScene responsibilities:

create():
- load tilemap
- create player
- create entity
- create key
- create exit
- create flashlight mask
- setup input
- setup audio

update(delta):
- update player movement
- update flashlight battery
- update flashlight mask
- update entity movement
- check entity freeze logic
- check key pickup
- check exit collision
- update audio volumes

---

# 15. COLLISION MATRIX

| Object  | Collides With |
|--------|---------------|
| Player | Walls |
| Entity | Walls |
| Player | Key |
| Player | Exit |
| Entity | Player |

---

# 16. REQUIRED FUNCTIONS FOR IMPLEMENTATION

Function: update_player_movement(delta)

Function: update_flashlight_state(delta)

Function: is_point_inside_flashlight_cone(point)

Function: check_line_of_sight(player_position, entity_position)

Function: update_entity_state(delta)

Function: update_entity_movement(delta)

Function: update_audio()

Function: check_key_collection()

Function: check_exit_collision()

---

# 17. INITIAL BALANCE VALUES (DO NOT MODIFY UNTIL TESTED)

player_speed = 90
entity_speed = 55

flashlight_radius = 220
flashlight_angle = 50 degrees

battery_max = 100
drain_rate = 25
recharge_rate = 10

map_size = 25 x 25 tiles

---

# 18. WIN CONDITION LOGIC

If player_has_key == true AND player overlaps exit:
    state = WIN

---

# 19. LOSE CONDITION LOGIC

If entity overlaps player:
    state = LOSE

---

# 20. VISUAL STYLE RULES (MANDATORY)

Only use:

black (#000000)
white (#FFFFFF)

Optional dithering patterns allowed.

No colors.

Entity must only be visible inside flashlight cone.

---

# 21. MINIMUM COMPLETION REQUIREMENTS

Game is considered complete when:

- Player can move
- Flashlight works with battery
- Entity chases player
- Entity freezes in light
- Key can be collected
- Exit unlocks after key
- Win and lose states function

---

# END OF DOCUMENT