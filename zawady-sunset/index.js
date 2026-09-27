(() => {
  const canvas = document.querySelector("#photo");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const image = new Image();
  const musicToggle = document.querySelector("#music-toggle");
  const conceptualPixelSize = 8;

  image.src = "./photo.jpg";

  let pixels;
  let originalPixels;
  let width = 0;
  let height = 0;
  let batchTimers = [];
  let audioContext;
  let masterGain;
  let musicPlaying = false;
  let musicTimer;
  let nextStepTime = 0;
  let nextStep = 0;

  const tempo = 100;
  const beatDuration = 60 / tempo;
  const stepDuration = beatDuration / 2;
  const bars = [
    [48, 55, 60, 64], // C major
    [45, 52, 57, 60], // A minor
    [41, 48, 53, 57], // F major
    [43, 50, 55, 59], // G major
  ];
  const arpeggioPattern = [0, 2, 1, 2, 3, 2, 1, 2];
  const leadMelody = [67, 76, 69, 72, 69, 77, 74, 71];

  function midiFrequency(note) {
    return 440 * 2 ** ((note - 69) / 12);
  }

  function scheduleArpeggio(note, startTime) {
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const endTime = startTime + stepDuration * 0.85;
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(midiFrequency(note), startTime);
    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(0.035, startTime + 0.006);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endTime);
    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(startTime);
    oscillator.stop(endTime + 0.01);
  }

  function scheduleLead(note, startTime) {
    const oscillator = audioContext.createOscillator();
    const envelope = audioContext.createGain();
    const vibrato = audioContext.createOscillator();
    const vibratoDepth = audioContext.createGain();
    const endTime = startTime + beatDuration * 2 * 0.96;
    const frequency = midiFrequency(note);

    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, startTime);
    vibrato.type = "sine";
    vibrato.frequency.setValueAtTime(5.2, startTime);
    vibratoDepth.gain.setValueAtTime(frequency * 0.012, startTime);
    vibrato.connect(vibratoDepth);
    vibratoDepth.connect(oscillator.frequency);

    envelope.gain.setValueAtTime(0.0001, startTime);
    envelope.gain.linearRampToValueAtTime(0.075, startTime + 0.025);
    envelope.gain.setValueAtTime(0.075, endTime - 0.08);
    envelope.gain.exponentialRampToValueAtTime(0.0001, endTime);
    oscillator.connect(envelope);
    envelope.connect(masterGain);
    oscillator.start(startTime);
    vibrato.start(startTime);
    oscillator.stop(endTime + 0.02);
    vibrato.stop(endTime + 0.02);
  }

  function scheduleMusicStep() {
    if (!musicPlaying) return;

    const now = audioContext.currentTime;
    while (nextStepTime < now + 0.12) {
      const stepInLoop = nextStep % 32;
      const bar = Math.floor(stepInLoop / 8);
      const stepInBar = stepInLoop % 8;
      const chord = bars[bar];
      scheduleArpeggio(chord[arpeggioPattern[stepInBar]], nextStepTime);

      if (stepInLoop % 4 === 0) {
        scheduleLead(leadMelody[Math.floor(stepInLoop / 4)], nextStepTime);
      }

      nextStep += 1;
      nextStepTime += stepDuration;
    }
    musicTimer = window.setTimeout(scheduleMusicStep, 25);
  }

  async function toggleMusic() {
    if (!audioContext) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        musicToggle.textContent = "Audio unavailable";
        musicToggle.disabled = true;
        return;
      }
      audioContext = new AudioContextClass();
      masterGain = audioContext.createGain();
      masterGain.gain.value = 0.22;
      masterGain.connect(audioContext.destination);
    }

    if (musicPlaying) {
      musicPlaying = false;
      window.clearTimeout(musicTimer);
      musicToggle.textContent = "Start melody";
      musicToggle.setAttribute("aria-pressed", "false");
      await audioContext.suspend();
      return;
    }

    await audioContext.resume();
    musicPlaying = true;
    nextStep = 0;
    nextStepTime = audioContext.currentTime + 0.08;
    musicToggle.textContent = "Stop melody";
    musicToggle.setAttribute("aria-pressed", "true");
    scheduleMusicStep();
  }

  musicToggle.addEventListener("click", toggleMusic);

  function drawPhoto() {
    batchTimers.forEach(window.clearTimeout);
    batchTimers = [];
    // photo.jpg is an 8x enlargement of a 200x150 pixel art image.
    width = Math.max(1, Math.round(image.naturalWidth / conceptualPixelSize));
    height = Math.max(1, Math.round(image.naturalHeight / conceptualPixelSize));
    canvas.width = width;
    canvas.height = height;

    // Sample one pixel from each enlarged pixel art block.
    context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, width, height);
    pixels = context.getImageData(0, 0, width, height);
    originalPixels = new Uint8ClampedArray(pixels.data);

    // Scale the low-resolution canvas to cover the screen without smoothing.
    const displayScale = Math.max(window.innerWidth / width, window.innerHeight / height);
    canvas.style.width = `${width * displayScale}px`;
    canvas.style.height = `${height * displayScale}px`;

    // Start with a subtle shift so every pixel differs slightly from the photo.
    for (let index = 0; index < width * height; index += 1) {
      setSubtleColor(index);
    }
    context.putImageData(pixels, 0, 0);

    for (let batch = 0; batch < 3; batch += 1) {
      const interval = 80;
      scheduleBatch(batch, interval);
    }
  }

  function scheduleBatch(batch, interval) {
    window.setTimeout(() => {
      if (!pixels) return;

      const pixelCount = width * height;
      for (let index = batch; index < pixelCount; index += 3) {
        setSubtleColor(index);
      }

      context.putImageData(pixels, 0, 0);
      for (let index = batch; index < pixelCount; index += 3) {
        if (Math.random() >= 0.25) continue;

        const offset = index * 4;
        const x = index % width;
        const y = Math.floor(index / width);
        context.fillStyle = `rgb(${pixels.data[offset]} ${pixels.data[offset + 1]} ${pixels.data[offset + 2]})`;
        context.fillRect(x, y, 5, 5);
      }

      // Keep the enlarged blocks for one frame, then restore the image pixels.
      window.requestAnimationFrame(() => context.putImageData(pixels, 0, 0));
      batchTimers[batch] = window.setTimeout(() => scheduleBatch(batch, interval), interval);
    }, interval);
  }

  function setSubtleColor(index) {
    const offset = index * 4;
    const sunsetBias = Math.random() < 0.5 ? [40, 12, -18] : [38, -10, 14];
    for (let channel = 0; channel < 3; channel += 1) {
      const variation = Math.floor(Math.random() * 21) - 10;
      const shift = sunsetBias[channel] + variation;
      pixels.data[offset + channel] = Math.max(
        0,
        Math.min(255, originalPixels[offset + channel] + shift),
      );
    }
  }

  image.addEventListener("load", () => {
    drawPhoto();
  });

  window.addEventListener("resize", () => {
    if (image.complete && image.naturalWidth) drawPhoto();
  });
})();
