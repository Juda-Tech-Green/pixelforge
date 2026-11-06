import Phaser from "phaser";
import {
  audioPresetNames,
  createSound,
  renderSound,
} from "@pixelforge/audio-core";
import { encodeWav } from "@pixelforge/audio-exporters";
import "../style.css";

const parent = document.getElementById("audio-game")!;
parent.style.cssText =
  "max-width:900px;margin:32px auto;padding:0 20px;font:14px 'Segoe UI',sans-serif";
const heading = document.createElement("h1");
heading.textContent = "PixelForge · Phaser audio sampler";
const intro = document.createElement("p");
intro.textContent =
  "Five original effects synthesized locally, decoded and played by Phaser. Select a sound to unlock audio and play it.";
const links = document.createElement("p");
const back = document.createElement("a");
back.href = "/audio.html";
back.textContent = "Open the audio editor";
back.style.color = "#b0db88";
links.append(back);
const status = document.createElement("p");
status.setAttribute("role", "status");
status.textContent = "Generating sound assets…";
const controls = document.createElement("div");
controls.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;margin:20px 0";
const stage = document.createElement("div");
stage.id = "phaser-audio-stage";
parent.append(heading, intro, links, controls, status, stage);
const urls: string[] = [];
class AudioScene extends Phaser.Scene {
  preload() {
    for (const preset of audioPresetNames) {
      const result = renderSound(createSound(preset, preset));
      const url = URL.createObjectURL(
        new Blob(
          [
            Uint8Array.from(encodeWav(result.pcm, result.project.sampleRate))
              .buffer,
          ],
          { type: "audio/wav" },
        ),
      );
      urls.push(url);
      this.load.audio(preset, url);
    }
    this.load.on("loaderror", () => {
      status.textContent = "Audio loading failed. Check browser audio support.";
    });
  }
  create() {
    status.textContent = `Ready · Phaser ${Phaser.VERSION} · all five WAV assets loaded`;
    const label = this.add.text(24, 22, "Select a sound above", {
      fontFamily: "Segoe UI",
      fontSize: "20px",
      color: "#e5e9ec",
    });
    const pulse = this.add.rectangle(360, 130, 48, 48, 0xb0db88);
    for (const preset of audioPresetNames) {
      const button = document.createElement("button");
      button.textContent = preset.replaceAll("-", " ");
      button.onclick = async () => {
        try {
          if (this.sound instanceof Phaser.Sound.WebAudioSoundManager)
            await this.sound.context.resume();
          this.sound.stopAll();
          const played = this.sound.play(preset);
          status.textContent = played
            ? `Playing ${preset}`
            : "Playback could not start. Check the audio output.";
          label.setText(preset);
          this.tweens.killTweensOf(pulse);
          pulse.setScale(1);
          this.tweens.add({
            targets: pulse,
            scaleX: 2,
            scaleY: 2,
            duration: 160,
            yoyo: true,
          });
        } catch (e) {
          status.textContent = String(e);
        }
      };
      controls.append(button);
    }
  }
}
const game = new Phaser.Game({
  type: Phaser.AUTO,
  width: 720,
  height: 240,
  parent: stage,
  backgroundColor: "#14181c",
  banner: false,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_HORIZONTALLY,
  },
  scene: AudioScene,
});
window.addEventListener(
  "pagehide",
  () => {
    game.destroy(true);
    urls.forEach((url) => URL.revokeObjectURL(url));
  },
  { once: true },
);
