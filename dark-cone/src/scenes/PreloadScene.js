export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload() {
    this.load.audio('foot_loop', 'foot.mp3');
    this.load.audio('key_pickup', 'key.mp3');
    this.load.audio('battery_drain', 'drain.mp3');
  }

  create() {
    this.scene.start('MenuScene');
  }
}
