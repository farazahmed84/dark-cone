export class MenuScene extends Phaser.Scene {
  constructor() {
    super('MenuScene');
  }

  create() {
    const centerX = this.cameras.main.width * 0.5;
    const titleY = 64;
    const premiseY = 250;
    const controlsY = 450;
    const startPromptY = 550;

    this.add.text(centerX, titleY, 'DARK CONE', {
      fontFamily: 'monospace',
      fontSize: '46px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(
      centerX,
      premiseY,
      'You are trapped inside a strange maze-like facility. Darkness allows a hostile ' +
      'entity to move. You need to use a flashlight to reveal the world and freeze ' +
      'the entity, but the flashlight has limited battery.\n\n' +
      'You must find a key first, then reach the exit while managing flashlight ' +
      'battery and avoiding the entity.',
      {
        fontFamily: 'monospace',
        fontSize: '20px',
        color: '#ffffff',
        align: 'center',
        wordWrap: { width: 540, useAdvancedWrap: true },
        lineSpacing: 8
      }
    ).setOrigin(0.5);

    this.add.text(
      centerX,
      controlsY,
      'Move: WASD / Arrow Keys   Light: Hold Left Mouse Button',
      {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#ffffff',
        align: 'center'
      }
    ).setOrigin(0.5);

    this.add.text(centerX, startPromptY, 'CLICK TO START', {
      fontFamily: 'monospace',
      fontSize: '32px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.input.once('pointerdown', () => {
      this.scene.start('GameScene');
    });

    this.input.keyboard.once('keydown-SPACE', () => {
      this.scene.start('GameScene');
    });
  }
}
