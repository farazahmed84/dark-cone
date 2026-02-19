export class EndScene extends Phaser.Scene {
  constructor() {
    super('EndScene');
  }

  init(data) {
    this.result = data?.result || 'RESULT';
    this.elapsedMs = data?.elapsedMs || 0;
  }

  create() {
    const centerX = this.cameras.main.width * 0.5;
    const centerY = this.cameras.main.height * 0.5;
    const normalizedResult = String(this.result || '').toUpperCase();
    const isWin = normalizedResult === 'WIN' || normalizedResult === 'ESCAPED';
    const title = isWin ? 'YOU ESCAPED' : 'YOU WERE CAUGHT';
    const subtitle = isWin
      ? 'You found the key and reached the exit.'
      : 'The entity reached you in the dark.';
    const timeLabel = `Time spent in the maze: ${this.formatElapsedTime(this.elapsedMs)}`;

    this.cameras.main.setBackgroundColor('#000000');

    this.add.text(centerX, centerY - 80, title, {
      fontFamily: 'monospace',
      fontSize: '44px',
      color: '#ffffff'
    }).setOrigin(0.5);

    this.add.text(centerX, centerY - 16, subtitle, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    this.add.text(centerX, centerY + 24, timeLabel, {
      fontFamily: 'monospace',
      fontSize: '18px',
      color: '#ffffff',
      align: 'center'
    }).setOrigin(0.5);

    this.add.text(centerX, centerY + 78, 'CLICK / SPACE / ENTER TO RETURN', {
      fontFamily: 'monospace',
      fontSize: '22px',
      color: '#ffffff'
    }).setOrigin(0.5);

    const returnToMenu = () => {
      this.scene.start('MenuScene');
    };

    this.input.once('pointerdown', returnToMenu);
    this.input.keyboard.once('keydown-SPACE', returnToMenu);
    this.input.keyboard.once('keydown-ENTER', returnToMenu);
  }

  formatElapsedTime(elapsedMs) {
    const totalSeconds = Math.floor(Math.max(0, elapsedMs) / 1000);
    if (totalSeconds < 60) {
      return `${totalSeconds} second${totalSeconds === 1 ? '' : 's'}`;
    }

    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')} (m:ss)`;
  }
}
