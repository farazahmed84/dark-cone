const TILE_SIZE = 24;
const MAP_SIZE = 25;
const WORLD_SIZE = TILE_SIZE * MAP_SIZE;
const PLAYER_SPEED = 90;

const BATTERY_MAX = 100;
const BATTERY_DRAIN_RATE = 25;
const BATTERY_RECHARGE_RATE = 10;
const MINIMUM_RESTART_THRESHOLD = 5;

const FLASHLIGHT_RADIUS = 220;
const FLASHLIGHT_ANGLE_DEGREES = 50;
const ENTITY_SPEED = 55;
const ENTITY_MIN_SPAWN_DISTANCE = 260;
const DEBUG_ENTITY_ALWAYS_VISIBLE = false;
const DEBUG_KEY_ALWAYS_VISIBLE = false;
const DEBUG_EXIT_ALWAYS_VISIBLE = false;
const ENTITY_PATH_RECALC_MS = 250;
const LOS_SAMPLE_STEP_PX = 4;
const KEY_MIN_SPAWN_DISTANCE = 170;
const EXIT_MIN_SPAWN_DISTANCE = 240;
const DARKNESS_ALPHA = 0.82;
const FOOTSTEP_MAX_DISTANCE = 350;

function createGrid() {
  const grid = [];
  for (let y = 0; y < MAP_SIZE; y += 1) {
    const row = [];
    for (let x = 0; x < MAP_SIZE; x += 1) {
      const isEdge = x === 0 || y === 0 || x === MAP_SIZE - 1 || y === MAP_SIZE - 1;
      row.push(isEdge ? 1 : 0);
    }
    grid.push(row);
  }

  const clearSpawnTiles = [
    [1, 1], [2, 1], [1, 2], [2, 2], [3, 1], [1, 3]
  ];
  const reservedSpawnKeys = new Set(clearSpawnTiles.map(([sx, sy]) => `${sx},${sy}`));
  for (let i = 0; i < clearSpawnTiles.length; i += 1) {
    const [sx, sy] = clearSpawnTiles[i];
    grid[sy][sx] = 0;
  }

  const canPlaceSegment = (startX, startY, length, horizontal) => {
    const cells = [];
    for (let i = 0; i < length; i += 1) {
      const x = horizontal ? startX + i : startX;
      const y = horizontal ? startY : startY + i;

      if (x < 1 || y < 1 || x >= MAP_SIZE - 1 || y >= MAP_SIZE - 1) {
        return false;
      }
      if (reservedSpawnKeys.has(`${x},${y}`)) {
        return false;
      }
      cells.push({ x, y });
    }

    for (let c = 0; c < cells.length; c += 1) {
      const cell = cells[c];
      for (let ny = cell.y - 1; ny <= cell.y + 1; ny += 1) {
        for (let nx = cell.x - 1; nx <= cell.x + 1; nx += 1) {
          if (nx < 1 || ny < 1 || nx >= MAP_SIZE - 1 || ny >= MAP_SIZE - 1) {
            continue;
          }
          if (grid[ny][nx] === 1) {
            return false;
          }
        }
      }
    }

    return true;
  };

  const placeSegment = (startX, startY, length, horizontal) => {
    for (let i = 0; i < length; i += 1) {
      const x = horizontal ? startX + i : startX;
      const y = horizontal ? startY : startY + i;
      grid[y][x] = 1;
    }
  };

  // Place short wall segments (3-4 tiles), each separated by at least one tile.
  let segmentsPlaced = 0;
  const targetSegments = 22;
  const maxAttempts = 3000;
  for (let attempt = 0; attempt < maxAttempts && segmentsPlaced < targetSegments; attempt += 1) {
    const horizontal = Math.random() < 0.5;
    const length = Phaser.Math.Between(3, 4);
    const maxStartX = horizontal ? MAP_SIZE - 2 - length : MAP_SIZE - 2;
    const maxStartY = horizontal ? MAP_SIZE - 2 : MAP_SIZE - 2 - length;
    const startX = Phaser.Math.Between(1, maxStartX);
    const startY = Phaser.Math.Between(1, maxStartY);

    if (canPlaceSegment(startX, startY, length, horizontal)) {
      placeSegment(startX, startY, length, horizontal);
      segmentsPlaced += 1;
    }
  }

  return grid;
}

export class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  init(data) {
    this.spawnRetryCount = data?.spawnRetryCount || 0;
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    this.walls = this.physics.add.staticGroup();
    this.grid = createGrid();

    for (let y = 0; y < MAP_SIZE; y += 1) {
      for (let x = 0; x < MAP_SIZE; x += 1) {
        const worldX = x * TILE_SIZE + TILE_SIZE * 0.5;
        const worldY = y * TILE_SIZE + TILE_SIZE * 0.5;

        this.add.rectangle(worldX, worldY, TILE_SIZE, TILE_SIZE, 0x000000).setStrokeStyle(1, 0xffffff, 0.08);

        if (this.grid[y][x] === 1) {
          const wall = this.add.rectangle(worldX, worldY, TILE_SIZE, TILE_SIZE, 0xffffff);
          this.physics.add.existing(wall, true);
          this.walls.add(wall);
        }
      }
    }

    const playerSpawn = this.getValidPlayerSpawnPosition();
    this.player = this.add.circle(playerSpawn.x, playerSpawn.y, 8, 0xffffff);
    this.player.setDepth(40);
    this.physics.add.existing(this.player);
    this.player.body.setCollideWorldBounds(true);

    this.physics.world.setBounds(0, 0, WORLD_SIZE, WORLD_SIZE);
    this.physics.add.collider(this.player, this.walls);

    const entitySpawn = this.getValidEntitySpawnPosition(ENTITY_MIN_SPAWN_DISTANCE);
    const playerSpawnTile = this.worldToTile(this.player.x, this.player.y);
    const entitySpawnTile = this.worldToTile(entitySpawn.x, entitySpawn.y);
    this.entity = this.add.circle(entitySpawn.x, entitySpawn.y, 8, 0xff0000);
    this.physics.add.existing(this.entity);
    this.entity.body.setCollideWorldBounds(true);
    this.entityState = 'HUNTING';
    this.entityVisibleInLightOnly = !DEBUG_ENTITY_ALWAYS_VISIBLE;
    this.entity.setVisible(DEBUG_ENTITY_ALWAYS_VISIBLE);

    this.physics.add.collider(this.entity, this.walls);
    this.physics.add.overlap(this.player, this.entity, this.handlePlayerCaught, null, this);
    this.entityPath = [];
    this.entityPathTimerMs = 0;

    this.playerHasKey = false;
    this.ensureKeyTexture();
    const keySpawnTile = this.getValidObjectiveSpawnTile(KEY_MIN_SPAWN_DISTANCE, [
      playerSpawnTile,
      entitySpawnTile
    ]);
    const keySpawn = this.tileToWorldCenter(keySpawnTile.x, keySpawnTile.y);
    this.key = this.add.image(keySpawn.x, keySpawn.y, 'key-icon');
    this.physics.add.existing(this.key, true);
    this.key.setVisible(DEBUG_KEY_ALWAYS_VISIBLE);
    this.physics.add.overlap(this.player, this.key, this.handleKeyPickup, null, this);

    const exitSpawnTile = this.getValidObjectiveSpawnTile(EXIT_MIN_SPAWN_DISTANCE, [
      playerSpawnTile,
      entitySpawnTile,
      keySpawnTile
    ]);
    const exitSpawn = this.tileToWorldCenter(exitSpawnTile.x, exitSpawnTile.y);
    this.exit = this.add.rectangle(exitSpawn.x, exitSpawn.y, TILE_SIZE, TILE_SIZE, 0x00ff00, 0.35);
    this.exit.setStrokeStyle(2, 0x00ff00, 1);
    this.exit.setVisible(DEBUG_EXIT_ALWAYS_VISIBLE);
    this.physics.add.existing(this.exit, true);
    this.physics.add.overlap(this.player, this.exit, this.handleExitReached, null, this);

    if (!this.validateInitialSpawnState()) {
      const nextRetry = this.spawnRetryCount + 1;
      if (nextRetry <= 8) {
        this.scene.restart({ spawnRetryCount: nextRetry });
        return;
      }
      throw new Error('Spawn validation failed after multiple retries.');
    }
    this.spawnRetryCount = 0;
    this.runStartTimeMs = this.time.now;

    this.keys = this.input.keyboard.addKeys({
      up: 'W',
      left: 'A',
      down: 'S',
      right: 'D',
      upArrow: 'UP',
      leftArrow: 'LEFT',
      downArrow: 'DOWN',
      rightArrow: 'RIGHT'
    });

    this.flashlight = {
      enabled: false,
      batteryCurrent: BATTERY_MAX,
      aimAngle: 0
    };
    this.batteryDrainSoundPlayed = false;

    this.playerDirectionGraphics = this.add.graphics();
    this.flashlightDebugConeGraphics = this.add.graphics().setDepth(35);
    this.darknessMaskGraphics = this.make.graphics({ x: 0, y: 0, add: false });
    this.darknessMask = this.darknessMaskGraphics.createGeometryMask();
    this.darknessMask.invertAlpha = true;
    this.darknessOverlay = this.add.rectangle(0, 0, WORLD_SIZE, WORLD_SIZE, 0x000000, DARKNESS_ALPHA)
      .setOrigin(0)
      .setDepth(30);
    this.darknessOverlay.setMask(this.darknessMask);

    this.uiLightText = this.add.text(8, 4, 'LIGHT: OFF', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff'
    }).setDepth(50);
    this.uiBatteryText = this.add.text(120, 4, 'BATTERY: 100', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff'
    }).setDepth(50);
    this.uiKeyText = this.add.text(260, 4, 'KEY: NO', {
      fontFamily: 'monospace',
      fontSize: '14px',
      color: '#ffffff'
    }).setDepth(50);
    this.exitHintText = this.add.text(WORLD_SIZE * 0.5, 34, 'EXIT LOCKED: FIND THE KEY', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#ffffff'
    }).setOrigin(0.5).setDepth(50).setVisible(false);
    this.exitHintTimerMs = 0;
    this.exitHintCooldownMs = 0;
    this.gameEnded = false;
    this.setupFootstepAudio();

    this.input.keyboard.once('keydown-ESC', () => {
      this.scene.start('MenuScene');
    });

    this.debugRevealAll = false;
    this.input.keyboard.on('keydown-V', () => {
      this.debugRevealAll = !this.debugRevealAll;
      const hudColor = this.debugRevealAll ? '#000000' : '#ffffff';
      this.uiLightText.setColor(hudColor);
      this.uiBatteryText.setColor(hudColor);
      this.uiKeyText.setColor(hudColor);
      this.exitHintText.setColor(hudColor);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard.off('keydown-V');
    });
  }

  update(_time, delta) {
    const deltaSeconds = delta / 1000;

    this.updatePlayerMovement();
    this.updateFlashlightState(deltaSeconds);
    this.updateEntityState(delta);
    this.updateObjectiveVisibility();
    this.updateFlashlightVisual();
    this.updateDarknessMask();
    this.updateAudio();
    this.updateExitHint(delta);
    this.updateUI();
  }

  updatePlayerMovement() {
    let vx = 0;
    let vy = 0;

    if (this.keys.left.isDown || this.keys.leftArrow.isDown) {
      vx -= 1;
    }
    if (this.keys.right.isDown || this.keys.rightArrow.isDown) {
      vx += 1;
    }
    if (this.keys.up.isDown || this.keys.upArrow.isDown) {
      vy -= 1;
    }
    if (this.keys.down.isDown || this.keys.downArrow.isDown) {
      vy += 1;
    }

    const velocity = new Phaser.Math.Vector2(vx, vy);
    if (velocity.lengthSq() > 0) {
      velocity.normalize().scale(PLAYER_SPEED);
    }

    this.player.body.setVelocity(velocity.x, velocity.y);
  }

  updateFlashlightState(deltaSeconds) {
    const pointer = this.input.activePointer;
    const dx = pointer.worldX - this.player.x;
    const dy = pointer.worldY - this.player.y;
    this.flashlight.aimAngle = Math.atan2(dy, dx);

    const wantsLight = pointer.leftButtonDown();
    const canStart = this.flashlight.batteryCurrent > MINIMUM_RESTART_THRESHOLD;
    const canSustain = this.flashlight.batteryCurrent > 0;

    if (wantsLight && (this.flashlight.enabled ? canSustain : canStart)) {
      this.flashlight.enabled = true;
    } else {
      this.flashlight.enabled = false;
    }

    if (this.flashlight.enabled) {
      this.flashlight.batteryCurrent -= BATTERY_DRAIN_RATE * deltaSeconds;
    } else {
      this.flashlight.batteryCurrent += BATTERY_RECHARGE_RATE * deltaSeconds;
    }

    this.flashlight.batteryCurrent = Phaser.Math.Clamp(this.flashlight.batteryCurrent, 0, BATTERY_MAX);

    if (this.flashlight.batteryCurrent <= 0) {
      this.flashlight.enabled = false;
      if (!this.batteryDrainSoundPlayed && this.cache.audio.exists('battery_drain')) {
        this.sound.play('battery_drain', { volume: 0.85 });
      }
      this.batteryDrainSoundPlayed = true;
    } else {
      this.batteryDrainSoundPlayed = false;
    }
  }

  updateFlashlightVisual() {
    const playerX = this.player.x;
    const playerY = this.player.y;
    const angleHalf = Phaser.Math.DegToRad(FLASHLIGHT_ANGLE_DEGREES * 0.5);
    const leftAngle = this.flashlight.aimAngle - angleHalf;
    const rightAngle = this.flashlight.aimAngle + angleHalf;

    const dirX = Math.cos(this.flashlight.aimAngle) * 14;
    const dirY = Math.sin(this.flashlight.aimAngle) * 14;
    this.playerDirectionGraphics.clear();
    this.flashlightDebugConeGraphics.clear();
    if (!this.flashlight.enabled) {
      return;
    }

    this.playerDirectionGraphics.lineStyle(2, 0xffffff, 1);
    this.playerDirectionGraphics.lineBetween(
      playerX,
      playerY,
      playerX + dirX,
      playerY + dirY
    );

    if (this.debugRevealAll) {
      this.flashlightDebugConeGraphics.fillStyle(0xffffff, 0.15);
      this.flashlightDebugConeGraphics.beginPath();
      this.flashlightDebugConeGraphics.moveTo(playerX, playerY);
      this.flashlightDebugConeGraphics.lineTo(
        playerX + Math.cos(leftAngle) * FLASHLIGHT_RADIUS,
        playerY + Math.sin(leftAngle) * FLASHLIGHT_RADIUS
      );
      this.flashlightDebugConeGraphics.lineTo(
        playerX + Math.cos(rightAngle) * FLASHLIGHT_RADIUS,
        playerY + Math.sin(rightAngle) * FLASHLIGHT_RADIUS
      );
      this.flashlightDebugConeGraphics.closePath();
      this.flashlightDebugConeGraphics.fillPath();
    }
  }

  updateDarknessMask() {
    this.darknessMaskGraphics.clear();
    this.darknessOverlay.setVisible(!this.debugRevealAll);
    if (this.debugRevealAll) {
      return;
    }

    this.darknessMaskGraphics.fillStyle(0xffffff, 1);

    if (this.flashlight.enabled) {
      const angleHalf = Phaser.Math.DegToRad(FLASHLIGHT_ANGLE_DEGREES * 0.5);
      const leftAngle = this.flashlight.aimAngle - angleHalf;
      const rightAngle = this.flashlight.aimAngle + angleHalf;
      const playerX = this.player.x;
      const playerY = this.player.y;

      this.darknessMaskGraphics.fillCircle(playerX, playerY, 14);
      this.darknessMaskGraphics.beginPath();
      this.darknessMaskGraphics.moveTo(playerX, playerY);
      this.darknessMaskGraphics.lineTo(
        playerX + Math.cos(leftAngle) * FLASHLIGHT_RADIUS,
        playerY + Math.sin(leftAngle) * FLASHLIGHT_RADIUS
      );
      this.darknessMaskGraphics.lineTo(
        playerX + Math.cos(rightAngle) * FLASHLIGHT_RADIUS,
        playerY + Math.sin(rightAngle) * FLASHLIGHT_RADIUS
      );
      this.darknessMaskGraphics.closePath();
      this.darknessMaskGraphics.fillPath();
    }

    if (DEBUG_ENTITY_ALWAYS_VISIBLE) {
      this.darknessMaskGraphics.fillCircle(this.entity.x, this.entity.y, 12);
    }
    if (DEBUG_KEY_ALWAYS_VISIBLE && this.key && this.key.active) {
      this.darknessMaskGraphics.fillCircle(this.key.x, this.key.y, 12);
    }
    if (DEBUG_EXIT_ALWAYS_VISIBLE && this.exit && this.exit.active) {
      this.darknessMaskGraphics.fillRect(
        this.exit.x - TILE_SIZE * 0.5,
        this.exit.y - TILE_SIZE * 0.5,
        TILE_SIZE,
        TILE_SIZE
      );
    }
  }

  updateEntityState(deltaMs) {
    if (this.gameEnded) {
      this.entity.body.setVelocity(0, 0);
      return;
    }

    const inCone = this.flashlight.enabled && this.isPointInsideFlashlightCone(this.entity);
    const lineOfSightClear = inCone && this.checkLineOfSight(
      this.player.x,
      this.player.y,
      this.entity.x,
      this.entity.y
    );

    if (this.entityVisibleInLightOnly) {
      this.entity.setVisible(this.debugRevealAll ? true : inCone);
    }

    if (lineOfSightClear) {
      this.entityState = 'FROZEN';
      this.entity.body.setVelocity(0, 0);
      return;
    }

    this.entityState = 'HUNTING';
    this.entityPathTimerMs -= deltaMs;
    if (this.entityPathTimerMs <= 0) {
      this.entityPathTimerMs = ENTITY_PATH_RECALC_MS;
      this.entityPath = this.findPathBetweenWorldPoints(
        this.entity.x,
        this.entity.y,
        this.player.x,
        this.player.y
      );
    }

    if (!this.entityPath || this.entityPath.length === 0) {
      this.entity.body.setVelocity(0, 0);
      return;
    }

    const target = this.entityPath[0];
    const toTarget = new Phaser.Math.Vector2(target.x - this.entity.x, target.y - this.entity.y);
    if (toTarget.lengthSq() <= 9) {
      this.entityPath.shift();
    }

    if (toTarget.lengthSq() > 0) {
      toTarget.normalize().scale(ENTITY_SPEED);
      this.entity.body.setVelocity(toTarget.x, toTarget.y);
    } else {
      this.entity.body.setVelocity(0, 0);
    }
  }

  updateObjectiveVisibility() {
    if (this.debugRevealAll) {
      if (this.key && this.key.active) {
        this.key.setVisible(true);
      }
      if (this.exit && this.exit.active) {
        this.exit.setVisible(true);
        this.exit.setAlpha(this.playerHasKey ? 1 : 0.35);
      }
      return;
    }

    if (this.key && this.key.active && !DEBUG_KEY_ALWAYS_VISIBLE) {
      const keyLit = this.flashlight.enabled &&
        this.isPointInsideFlashlightCone(this.key) &&
        this.checkLineOfSight(this.player.x, this.player.y, this.key.x, this.key.y);
      this.key.setVisible(keyLit);
    }

    if (this.exit && this.exit.active) {
      const exitLit = this.flashlight.enabled &&
        this.isPointInsideFlashlightCone(this.exit) &&
        this.checkLineOfSight(this.player.x, this.player.y, this.exit.x, this.exit.y);
      this.exit.setVisible(DEBUG_EXIT_ALWAYS_VISIBLE ? true : exitLit);
      this.exit.setAlpha(this.playerHasKey ? 1 : 0.35);
    }
  }

  ensureKeyTexture() {
    if (this.textures.exists('key-icon')) {
      return;
    }

    const g = this.make.graphics({ x: 0, y: 0, add: false });
    g.fillStyle(0xffd700, 1);
    g.fillCircle(5, 8, 3);
    g.fillRect(8, 7, 6, 2);
    g.fillRect(12, 5, 2, 2);
    g.fillRect(10, 9, 2, 2);
    g.generateTexture('key-icon', 16, 16);
    g.destroy();
  }

  isPointInsideFlashlightCone(point) {
    const toPointX = point.x - this.player.x;
    const toPointY = point.y - this.player.y;
    const distance = Math.sqrt(toPointX * toPointX + toPointY * toPointY);

    if (distance > FLASHLIGHT_RADIUS) {
      return false;
    }

    const angleToPoint = Math.atan2(toPointY, toPointX);
    const angleDiff = Math.abs(Phaser.Math.Angle.Wrap(angleToPoint - this.flashlight.aimAngle));
    const halfAngle = Phaser.Math.DegToRad(FLASHLIGHT_ANGLE_DEGREES * 0.5);

    return angleDiff <= halfAngle;
  }

  checkLineOfSight(startX, startY, endX, endY) {
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance <= LOS_SAMPLE_STEP_PX) {
      return true;
    }

    const steps = Math.ceil(distance / LOS_SAMPLE_STEP_PX);
    for (let i = 1; i < steps; i += 1) {
      const t = i / steps;
      const sampleX = startX + dx * t;
      const sampleY = startY + dy * t;
      const tile = this.worldToTile(sampleX, sampleY);
      if (!this.isWalkableTile(tile.x, tile.y)) {
        return false;
      }
    }

    return true;
  }

  getValidEntitySpawnPosition(minDistanceFromPlayer) {
    const playerTile = this.worldToTile(this.player.x, this.player.y);
    const farCandidates = [];
    let bestCandidate = null;
    let bestDistance = -1;

    for (let tileY = 1; tileY < MAP_SIZE - 1; tileY += 1) {
      for (let tileX = 1; tileX < MAP_SIZE - 1; tileX += 1) {
        if (!this.isWalkableTile(tileX, tileY)) {
          continue;
        }
        if (!this.isTileReachableFrom(playerTile.x, playerTile.y, tileX, tileY)) {
          continue;
        }

        const x = tileX * TILE_SIZE + TILE_SIZE * 0.5;
        const y = tileY * TILE_SIZE + TILE_SIZE * 0.5;
        const distanceToPlayer = Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y);

        if (distanceToPlayer >= minDistanceFromPlayer) {
          farCandidates.push({ x, y, distance: distanceToPlayer });
        }
        if (distanceToPlayer > bestDistance) {
          bestDistance = distanceToPlayer;
          bestCandidate = { x, y, distance: distanceToPlayer };
        }
      }
    }

    if (farCandidates.length > 0) {
      // Prefer top farthest candidates to keep starts consistently safer.
      farCandidates.sort((a, b) => b.distance - a.distance);
      const poolSize = Math.max(1, Math.ceil(farCandidates.length * 0.35));
      const pickIndex = Phaser.Math.Between(0, poolSize - 1);
      return { x: farCandidates[pickIndex].x, y: farCandidates[pickIndex].y };
    }

    if (bestCandidate) {
      return { x: bestCandidate.x, y: bestCandidate.y };
    }

    // Should not happen with valid map, but never spawn on top-left by default.
    return { x: this.player.x + TILE_SIZE * 6, y: this.player.y + TILE_SIZE * 6 };
  }

  getValidPlayerSpawnPosition() {
    const preferred = { x: 1, y: 1 };
    if (this.isWalkableTile(preferred.x, preferred.y)) {
      return this.tileToWorldCenter(preferred.x, preferred.y);
    }

    let best = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let tileY = 1; tileY < MAP_SIZE - 1; tileY += 1) {
      for (let tileX = 1; tileX < MAP_SIZE - 1; tileX += 1) {
        if (!this.isWalkableTile(tileX, tileY)) {
          continue;
        }
        const d = Phaser.Math.Distance.Between(tileX, tileY, preferred.x, preferred.y);
        if (d < bestDistance) {
          bestDistance = d;
          best = { x: tileX, y: tileY };
        }
      }
    }

    return best ? this.tileToWorldCenter(best.x, best.y) : this.tileToWorldCenter(1, 1);
  }

  getValidObjectiveSpawnTile(minDistanceFromPlayer, blockedTiles = []) {
    const playerTile = this.worldToTile(this.player.x, this.player.y);
    const blockedTileKeys = new Set(blockedTiles.map((tile) => this.tileKey(tile.x, tile.y)));
    const reachableCandidates = [];
    const farCandidates = [];

    for (let tileY = 1; tileY < MAP_SIZE - 1; tileY += 1) {
      for (let tileX = 1; tileX < MAP_SIZE - 1; tileX += 1) {
        const currentTileKey = this.tileKey(tileX, tileY);
        if (blockedTileKeys.has(currentTileKey)) {
          continue;
        }
        if (!this.isWalkableTile(tileX, tileY)) {
          continue;
        }
        if (!this.isTileReachableFrom(playerTile.x, playerTile.y, tileX, tileY)) {
          continue;
        }

        const world = this.tileToWorldCenter(tileX, tileY);
        const distanceToPlayer = Phaser.Math.Distance.Between(world.x, world.y, this.player.x, this.player.y);
        const candidate = { x: tileX, y: tileY, distance: distanceToPlayer };
        reachableCandidates.push(candidate);
        if (distanceToPlayer >= minDistanceFromPlayer) {
          farCandidates.push(candidate);
        }
      }
    }

    const pickFrom = farCandidates.length > 0 ? farCandidates : reachableCandidates;
    if (pickFrom.length > 0) {
      const index = Phaser.Math.Between(0, pickFrom.length - 1);
      return { x: pickFrom[index].x, y: pickFrom[index].y };
    }

    // Last-resort fallback: never return a blocked tile.
    for (let tileY = 1; tileY < MAP_SIZE - 1; tileY += 1) {
      for (let tileX = 1; tileX < MAP_SIZE - 1; tileX += 1) {
        const currentTileKey = this.tileKey(tileX, tileY);
        if (!blockedTileKeys.has(currentTileKey) && this.isWalkableTile(tileX, tileY)) {
          return { x: tileX, y: tileY };
        }
      }
    }

    return { x: 1, y: 1 };
  }

  validateInitialSpawnState() {
    const playerTile = this.worldToTile(this.player.x, this.player.y);
    const entityTile = this.worldToTile(this.entity.x, this.entity.y);
    const keyTile = this.worldToTile(this.key.x, this.key.y);
    const exitTile = this.worldToTile(this.exit.x, this.exit.y);

    const tileKeys = [
      this.tileKey(playerTile.x, playerTile.y),
      this.tileKey(entityTile.x, entityTile.y),
      this.tileKey(keyTile.x, keyTile.y),
      this.tileKey(exitTile.x, exitTile.y)
    ];
    const allUnique = new Set(tileKeys).size === tileKeys.length;

    const allWalkable = this.isWalkableTile(playerTile.x, playerTile.y) &&
      this.isWalkableTile(entityTile.x, entityTile.y) &&
      this.isWalkableTile(keyTile.x, keyTile.y) &&
      this.isWalkableTile(exitTile.x, exitTile.y);

    const entityDistance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.entity.x,
      this.entity.y
    );
    const entityFarEnough = entityDistance >= ENTITY_MIN_SPAWN_DISTANCE;

    return allUnique && allWalkable && entityFarEnough;
  }

  isWalkableTile(tileX, tileY) {
    if (tileX < 0 || tileY < 0 || tileX >= MAP_SIZE || tileY >= MAP_SIZE) {
      return false;
    }
    return this.grid[tileY][tileX] === 0;
  }

  worldToTile(worldX, worldY) {
    return {
      x: Phaser.Math.Clamp(Math.floor(worldX / TILE_SIZE), 0, MAP_SIZE - 1),
      y: Phaser.Math.Clamp(Math.floor(worldY / TILE_SIZE), 0, MAP_SIZE - 1)
    };
  }

  tileToWorldCenter(tileX, tileY) {
    return {
      x: tileX * TILE_SIZE + TILE_SIZE * 0.5,
      y: tileY * TILE_SIZE + TILE_SIZE * 0.5
    };
  }

  tileKey(tileX, tileY) {
    return `${tileX},${tileY}`;
  }

  findPathBetweenWorldPoints(startX, startY, endX, endY) {
    const start = this.worldToTile(startX, startY);
    const end = this.worldToTile(endX, endY);
    const tilePath = this.findTilePath(start.x, start.y, end.x, end.y);
    if (!tilePath || tilePath.length <= 1) {
      return [];
    }

    const worldPath = [];
    for (let i = 1; i < tilePath.length; i += 1) {
      worldPath.push(this.tileToWorldCenter(tilePath[i].x, tilePath[i].y));
    }
    return worldPath;
  }

  isTileReachableFrom(startX, startY, endX, endY) {
    const path = this.findTilePath(startX, startY, endX, endY);
    return !!path;
  }

  findTilePath(startX, startY, endX, endY) {
    if (!this.isWalkableTile(startX, startY) || !this.isWalkableTile(endX, endY)) {
      return null;
    }

    const startKey = this.tileKey(startX, startY);
    const endKey = this.tileKey(endX, endY);
    const queue = [{ x: startX, y: startY }];
    const visited = new Set([startKey]);
    const cameFrom = new Map();
    const neighbors = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 }
    ];

    while (queue.length > 0) {
      const current = queue.shift();
      const currentKey = this.tileKey(current.x, current.y);
      if (currentKey === endKey) {
        const path = [];
        let walkKey = endKey;
        while (walkKey) {
          const [px, py] = walkKey.split(',').map(Number);
          path.push({ x: px, y: py });
          walkKey = cameFrom.get(walkKey);
        }
        path.reverse();
        return path;
      }

      for (let i = 0; i < neighbors.length; i += 1) {
        const nextX = current.x + neighbors[i].x;
        const nextY = current.y + neighbors[i].y;
        const nextKey = this.tileKey(nextX, nextY);

        if (!this.isWalkableTile(nextX, nextY) || visited.has(nextKey)) {
          continue;
        }

        visited.add(nextKey);
        cameFrom.set(nextKey, currentKey);
        queue.push({ x: nextX, y: nextY });
      }
    }

    return null;
  }

  handlePlayerCaught() {
    if (this.gameEnded) {
      return;
    }

    this.gameEnded = true;
    this.player.body.setVelocity(0, 0);
    this.entity.body.setVelocity(0, 0);
    if (this.footstepLoop && this.footstepLoop.isPlaying) {
      this.footstepLoop.stop();
    }
    const elapsedMs = this.getElapsedRunTimeMs();
    this.scene.start('EndScene', { result: 'LOSE', elapsedMs });
  }

  handleKeyPickup() {
    if (this.gameEnded || this.playerHasKey || !this.key || !this.key.active) {
      return;
    }
    if (!this.flashlight.enabled) {
      return;
    }

    this.playerHasKey = true;
    if (this.cache.audio.exists('key_pickup')) {
      this.sound.play('key_pickup', { volume: 0.7 });
    }
    this.key.destroy();
    this.exit.setAlpha(1);
  }

  handleExitReached() {
    if (this.gameEnded) {
      return;
    }

    if (!this.playerHasKey) {
      if (this.flashlight.enabled) {
        this.showExitLockedMessage();
      }
      return;
    }

    const exitLitNow = this.flashlight.enabled &&
      this.isPointInsideFlashlightCone(this.exit) &&
      this.checkLineOfSight(this.player.x, this.player.y, this.exit.x, this.exit.y);
    if (!exitLitNow) {
      return;
    }

    this.gameEnded = true;
    this.player.body.setVelocity(0, 0);
    this.entity.body.setVelocity(0, 0);
    if (this.footstepLoop && this.footstepLoop.isPlaying) {
      this.footstepLoop.stop();
    }
    const elapsedMs = this.getElapsedRunTimeMs();
    this.scene.start('EndScene', { result: 'WIN', elapsedMs });
  }

  getElapsedRunTimeMs() {
    if (typeof this.runStartTimeMs !== 'number') {
      return 0;
    }
    return Math.max(0, this.time.now - this.runStartTimeMs);
  }

  showExitLockedMessage() {
    if (this.exitHintCooldownMs > 0) {
      return;
    }

    this.exitHintText.setVisible(true);
    this.exitHintTimerMs = 1400;
    this.exitHintCooldownMs = 600;
  }

  updateExitHint(deltaMs) {
    if (this.exitHintCooldownMs > 0) {
      this.exitHintCooldownMs = Math.max(0, this.exitHintCooldownMs - deltaMs);
    }

    if (this.exitHintTimerMs > 0) {
      this.exitHintTimerMs = Math.max(0, this.exitHintTimerMs - deltaMs);
      if (this.exitHintTimerMs <= 0) {
        this.exitHintText.setVisible(false);
      }
    }
  }

  setupFootstepAudio() {
    this.footstepLoop = null;
    if (this.cache.audio.exists('foot_loop')) {
      this.footstepLoop = this.sound.add('foot_loop', {
        loop: true,
        volume: 0.1
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.footstepLoop && this.footstepLoop.isPlaying) {
        this.footstepLoop.stop();
      }
    });
  }

  updateAudio() {
    if (!this.footstepLoop) {
      return;
    }

    if (this.gameEnded || this.entityState !== 'HUNTING') {
      if (this.footstepLoop.isPlaying) {
        this.footstepLoop.stop();
      }
      return;
    }

    const distance = Phaser.Math.Distance.Between(
      this.player.x,
      this.player.y,
      this.entity.x,
      this.entity.y
    );

    let volume = 0.1;
    if (distance <= FOOTSTEP_MAX_DISTANCE) {
      volume = Phaser.Math.Linear(1.0, 0.1, distance / FOOTSTEP_MAX_DISTANCE);
    }
    this.footstepLoop.setVolume(Phaser.Math.Clamp(volume, 0.1, 1.0));

    if (!this.footstepLoop.isPlaying) {
      this.footstepLoop.play();
    }
  }

  updateUI() {
    const batteryPercent = Math.round(this.flashlight.batteryCurrent);
    const lightStatus = this.flashlight.enabled ? 'ON' : 'OFF';
    const keyStatus = this.playerHasKey ? 'YES' : 'NO';
    this.uiLightText.setText(`LIGHT: ${lightStatus}`);
    this.uiBatteryText.setText(`BATTERY: ${batteryPercent}`);
    this.uiKeyText.setText(`KEY: ${keyStatus}`);
    if (this.debugRevealAll) {
      this.uiBatteryText.setColor('#000000');
    } else {
      this.uiBatteryText.setColor(batteryPercent <= 0 ? '#ff0000' : '#ffffff');
    }
  }
}
