import { GESTURE, LAUNCHPAD, MIDI, MODE, NUMBER_OF, OUTLET, STEP_VALUE } from '../config';
import PressGesture from './PressGesture';
import RangeSelectionGesture from './RangeSelectionGesture';

// const SAVE_DELAY = 2500; // ms

function xyToIndex(x, y) {
  return (y * NUMBER_OF.COLUMNS) + x;
}

export default class Controller {

  constructor(model, view) {
    this._model = model;
    this._view = view;
    this._topButtonGesture = new PressGesture;
    this._rightButtonGesture = new PressGesture;
    this._gridButtonGesture = new RangeSelectionGesture;
    this._patternStepsClipboard = null;
    this._patternStepsUndo = null;
  }

  // // but this isn't called form the outside ...
  // handleChange() {
  //   // use a delay to avoid creating undo state on every interaction
  //   if (this.saveAfterDelay) {
  //     this.saveAfterDelay.cancel();
  //   }
  //   this.saveAfterDelay = new Task(() => {
  //     this.saveAfterDelay = null;
  //     this.onSave();
  //   })
  //   this.saveAfterDelay.schedule(SAVE_DELAY);
  // }

  refreshViews() {
    this._view.render();
  }

  load(jsonString) {
    let json;
    try {
      json = JSON.parse(jsonString);
    } catch (err) {
      console.error(err, jsonString);
      return;
    }
    this._model.fromJSON(json);
    this._view.render();
  }

  reset() {
    this._model.reset();
    this._topButtonGesture.reset();
    this._rightButtonGesture.reset();
    this._gridButtonGesture.reset();
    this._heldTopButton = false;
    this._view.render();
  }

  handleLaunchpadCC(cc, value) {
    if (cc !== MIDI.TRANSPORT_STOP) {
      this._handleLaunchpadTopButton(cc - LAUNCHPAD.TOP_ROW_CC, value > 0);
    } else {
      this.handleClockTick(-1);
      this._view.render(); // transport stop clears the launchpad grid
    }
  }

  handleLaunchpadNote(pitch, velocity) {
    const x = pitch % 16;
    const y = Math.floor(pitch / 16);
    if (x > 7) {
      this._handleLaunchpadRightButton(y, velocity > 0);
    } else {
      this._handleLaunchpadGridButton(x, y, velocity > 0);
    }
  }

  _handleLaunchpadTopButton(index, isPressed) {
    if (isPressed) {
      if (this._model.mode === MODE.PATTERN_EDIT) {
        const gesture = this._topButtonGesture.interpretPress(index);
        switch (index) {
          case 0:
            this.shiftSelectedPatternUp();
            break;
          case 1:
            this.shiftSelectedPatternDown();
            break;
          case 2:
            this.shiftSelectedPatternLeft();
            break;
          case 3:
            this.shiftSelectedPatternRight();
            break;
          case 4:
            this.reverseSelectedPattern();
            break;
          case 5:
            if (gesture === GESTURE.DOUBLE_PRESS) {
              this._undoSelectedPatternSteps();
            } else {
              this._recordSelectedPatternStepsForUndo();
              this.randomizeSelectedPattern();
            }
            break;
          case 6:
            this.copyStepsFromSelectedPattern();
            break;
          case 7:
            if (gesture === GESTURE.DOUBLE_PRESS) {
              this._undoSelectedPatternSteps();
            } else {
              this._recordSelectedPatternStepsForUndo();
              this.pasteStepsToSelectedPattern();
            }
            break;
        }
      } else {
        if (index <= 3) {
          switch (this._topButtonGesture.interpretPress(index)) {
            case GESTURE.SELECT:
              this.selectTrack(index);
              break;
            case GESTURE.TRIPLE_PRESS:
              this.setSelectedTrackMute(!this._model.selectedTrack.mute);
              this._topButtonGesture.reset(); // so we can reuse this gesture in pattern edit mode
              break;
          }
        } else {
          this.selectOrToggleValue(index - 3);
        }
      }
    }
    this._heldTopButton = isPressed;
    this._rightButtonGesture.reset();
  }

  _handleLaunchpadRightButton(index, isPressed) {
    const model = this._model;
    if (isPressed) {
      if (model.mode === MODE.PATTERN_EDIT) {
        if (!this._heldTopButton) {
          model.mode = MODE.SEQUENCER;
          this.selectPattern(index, { forceRender: true });
        }
      }
      else {
        switch (this._rightButtonGesture.interpretPress(index)) {
          case GESTURE.SELECT:
            this.selectPattern(index);
            break;
          case GESTURE.TRIPLE_PRESS:
            if (this._heldTopButton) {
              model.mode = MODE.PATTERN_EDIT;
              this._gridButtonGesture.reset();
              this._view.render();
            } else {
              this.setSelectedPatternMute(!model.selectedPattern.mute);
            }
            break;
        }
      }
    }
    this._topButtonGesture.reset();
  }

  _handleLaunchpadGridButton(x, y, isPressed) {
    const stepIndex = xyToIndex(x, y);
    if (this._model.mode === MODE.PATTERN_EDIT) {
      const range = this._gridButtonGesture.interpretRangeSelection(stepIndex, isPressed);
      if (range) {
        this._model.selectedPattern.setRange(...range);
        this._view.renderGrid();
      }
    }
    else if (isPressed) {
      this.setStepToSelectedValue(stepIndex);
    }
    this._topButtonGesture.reset();
    this._rightButtonGesture.reset();
  }

  handleTrackNote(pitch, velocity) {
    // TODO: port from MidiController
    // But I want to drastically simplify:
    // - Only track muting, not pattern muting (or maybe just allow for muting the 3 gate patterns in each track)
    // - No set base track pitch
    // - Bigger range for setting the scale (in the middle of the keyboard)
    // - Global transpose should be relative to scale (i.e. allow you to adjust the arpeggio)
  }

  handleClockTick(clockIndex) {
    if (clockIndex !== this._model.clockIndex) {
      this._model.clockIndex = clockIndex;
      this._view.renderClock();
    }
    if (clockIndex >= 0) {
      this._model.tracks.forEach((track) => {
        const note = track.noteForClock(clockIndex);
        if (note.enabled && !note.mute) {
          if (note.duration > 0) {
            outlet(OUTLET.NOTE, note.pitch, note.velocity, note.duration);
          }
          if (note.modulation != null) {
            outlet(OUTLET.CC, 1, note.modulation);
          }
          if (note.aftertouch != null) {
            outlet(OUTLET.AFTERTOUCH, note.aftertouch);
          }
        }
      });
    }
  }

  setGlobalStepDuration(stepDuration) {
    this._model.globalStepDuration = stepDuration;
  }

  setScale(...pitchClasses) {
    this._model.scale.pitchClasses = pitchClasses;
  }

  selectTrack(trackIndex) {
    if (trackIndex !== this._model.selectedTrackIndex) {
      this._model.selectedTrackIndex = trackIndex;
      this._view.renderTrack(); // I'm debating renaming this to renderSelectedTrack() vs passing in a trackIndex
    }
  }

  selectOrToggleValue(value) {
    this._model.selectedValue = (this._model.selectedValue === value) ? STEP_VALUE.OFF : value;
    this._view.renderValue();
  }

  selectPattern(patternIndex, { forceRender = false } = {}) {
    if (forceRender || patternIndex !== this._model.selectedPatternIndex) {
      this._model.selectedPatternIndex = patternIndex;
      this._view.renderPattern();
    }
  }

  handleGridClick(x, y) {
    this.setStepToSelectedValue(xyToIndex(x, y));
  }

  setStepToSelectedValue(stepIndex) {
    const model = this._model;
    model.selectedPattern.steps[stepIndex] = model.selectedValue;
    model.selectedStepIndex = stepIndex;
    this._view.renderStep();
  }

  setSelectedTrackPitch(pitch) {
    this._model.selectedTrack.pitch = pitch;
  }

  setSelectedTrackVelocity(velocity) {
    this._model.selectedTrack.velocity = velocity;
  }

  setSelectedTrackGate(gate) {
    this._model.selectedTrack.gate = gate;
  }

  setSelectedTrackMute(mute) {
    this._model.selectedTrack.mute = mute;
    this._view.renderSelectedTrackMute();
  }

  setSelectedTrackDurationMultiplier(durationMultiplier) {
    this._model.selectedTrack.durationMultiplier = durationMultiplier;
  }

  setSelectedPatternStart(stepIndex) {
    this._model.selectedPattern.startStepIndex = stepIndex;
    this._view.renderGrid();
  }

  setSelectedPatternEnd(stepIndex) {
    this._model.selectedPattern.endStepIndex = stepIndex;
    this._view.renderGrid();
  }

  setSelectedPatternMute(mute) {
    this._model.selectedPattern.mute = mute;
    this._view.renderSelectedPatternMute();
  }

  reverseSelectedPattern() {
    this._model.selectedPattern.reverse();
    this._view.renderGrid();
  }

  randomizeSelectedPattern() {
    this._model.selectedPattern.randomize();
    this._view.renderGrid();
  }

  invertSelectedPattern() {
    this._model.selectedPattern.invert();
    this._view.renderGrid();
  }

  shiftSelectedPatternLeft() {
    this._model.selectedPattern.shift(1);
    this._view.renderGrid();
  }

  shiftSelectedPatternRight() {
    this._model.selectedPattern.shift(-1);
    this._view.renderGrid();
  }

  shiftSelectedPatternUp() {
    this._model.selectedPattern.shift(NUMBER_OF.COLUMNS);
    this._view.renderGrid();
  }

  shiftSelectedPatternDown() {
    this._model.selectedPattern.shift(-NUMBER_OF.COLUMNS);
    this._view.renderGrid();
  }

  copyStepsFromSelectedPattern() {
    this._patternStepsClipboard = this._model.selectedPattern.steps.slice(); // slice to freeze this state
  }

  pasteStepsToSelectedPattern() {
    if (this._patternStepsClipboard) {
      this._model.selectedPattern.steps = this._patternStepsClipboard;
      this._view.renderGrid();
    }
  }

  _recordSelectedPatternStepsForUndo() {
    this._patternStepsUndo = this._model.selectedPattern.steps.slice(); // slice to freeze this state
  }

  _undoSelectedPatternSteps() {
    if (this._patternStepsUndo) {
      this._model.selectedPattern.steps = this._patternStepsUndo;
      this._patternStepsUndo = null;
      this._view.renderGrid();
    }
  }
}