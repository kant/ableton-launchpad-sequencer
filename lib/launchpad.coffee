class Launchpad

  @color = (green,red) ->
    16*green + red if (0 <= green <= 3) and (0 <= red <= 3)


  @OFF:    @color(0,0)
  @GREEN:  @color(3,0)
  @YELLOW: @color(3,2)
  @ORANGE: @color(2,3)
  @RED:    @color(0,3)
  @GRID_COLORS: [@OFF, @GREEN, @YELLOW, @ORANGE, @RED]

  @STEP_COLOR:    @color(1,1) # color for current sequencer step, regardless of value
  @TRACK_COLOR:   @color(1,2)
  @PATTERN_COLOR: @color(2,0)

  @MUTE_COLOR:          @color(0,3)
  @INACTIVE_MUTE_COLOR: @color(0,1)


  constructor: ->
    @onTopDown   = NOOP
    @onTopUp     = NOOP
    @onRightDown = NOOP
    @onRightUp   = NOOP
    @onGridDown  = NOOP
    @onGridUp    = NOOP
    @heldTop     = null # top button currently (and most recently) held down.
    @heldGridX   = null # x index of grid button currently (and most recently) held down.
    @heldGridY   = null # y index of grid button currently (and most recently) held down.

  ctlin: (cc, value) ->
    index = cc - 104
    if value > 0
      @heldTop = index
      @onTopDown(index)
    else
      @heldTop = null # this isn't accurate for multiple buttons held, but good enough for our purposes
      @onTopUp(index)
    return


  notein: (pitch, velocity) ->
    x = pitch % 16
    y = Math.floor(pitch / 16)
    if x > 7
      if velocity > 0 then @onRightDown(y) else @onRightUp(y)
    else
      if velocity > 0
        @onGridDown(x,y)
        @heldGridX = x
        @heldGridY = y
      else
        @onGridUp(x,y)
        @heldGridX = null
        @heldGridY = null
    return


  ctlout: (cc, value) ->
    outlet LAUNCHPAD_CC, cc, value
    return


  noteout: (pitch, velocity) ->
    outlet LAUNCHPAD_NOTE, pitch, velocity
    return


  allOff: ->
    @ctlout(0,0)
    return


  track: (track) ->
    color = if track.mute then Launchpad.MUTE_COLOR else Launchpad.TRACK_COLOR
    @_top(track.index, color)
    return

  trackOff: (track) ->
    color = if track.mute then Launchpad.INACTIVE_MUTE_COLOR else Launchpad.OFF
    @_top(track.index, color)
    return


  stepValue: (stepValue) ->
    @_top(stepValue+3, Launchpad.GRID_COLORS[stepValue]) if stepValue > 0
    return

  stepValueOff: (stepValue) ->
    @_top(stepValue+3, Launchpad.OFF) if stepValue > 0
    return


  pattern: (pattern) ->
    color = if pattern.mute then Launchpad.MUTE_COLOR else Launchpad.PATTERN_COLOR
    @_right(pattern.index, color)
    return

  patternOff: (pattern) ->
    color = if pattern.mute then Launchpad.INACTIVE_MUTE_COLOR else Launchpad.OFF
    @_right(pattern.index, color)
    return


  grid: (x, y, value) ->
    @_grid(x, y, Launchpad.GRID_COLORS[value])
    return


  activeStep: (x, y) ->
    @_grid(x, y, Launchpad.STEP_COLOR)
    return


  # enter the mode for pattern operations (set start & end, copy, paste, shift left, shift right)
  patternOps: (pattern) ->
    start = pattern.start
    end = pattern.end
    pattern.each (x,y,index) =>
      color = if start <= index <= end then Launchpad.STEP_COLOR else Launchpad.OFF
      @_grid(x, y, color)
      return
    # light up all stepValue lights to indicate they're in "pattern operation" mode
    @_top(4, Launchpad.GRID_COLORS[1])
    @_top(5, Launchpad.GRID_COLORS[2])
    @_top(6, Launchpad.GRID_COLORS[3])
    @_top(7, Launchpad.GRID_COLORS[4])
    return


  # ==============================================================================
  # private

  _top:   (index, color) ->
    @ctlout(104+index, color) if (0 <= index <= 7)
    return

  _grid:   (x, y, color) ->
    @noteout(16*y + x, color) if (0 <= x <= 7) and (0 <= y <= 7)
    return

  _right: (index, color) ->
    @noteout(16*index + 8, color) if (0 <= index <= 7)
    return
