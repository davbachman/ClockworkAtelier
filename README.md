# Clockwork Atelier

[Open the app](https://davbachman.github.io/ClockworkAtelier/)

Created by David Bachman with GPT 5.4. To learn more about David see https://pzacad.pitzer.edu/~dbachman/, and subscribe to his AI podcast *Entropy Bonus* at https://profbachman.substack.com/.

## Brief description
Clockwork Atelier is a browser-based workshop for designing layered gear trains in two different scenes:

- `Clockwork` for building a layered mechanical clock with second, minute, hour, AM/PM, and day outputs.
- `Orrery` for building a layered planetary mechanism with Mercury through Saturn outputs.

You can place and move gears, inspect rates, toggle optional extra layers, animate the mechanism, and save or reload projects as JSON.

## Instructions for use
Use the top menu bar:

- `File`:
  Open `About` to jump to the GitHub repository in a new tab.
  Use `Save` to save the current project as JSON.
  Use `Import` to load a saved JSON project.
- `Mode`:
  Switch between `Clockwork` and `Orrery`.
- `Extra`:
  In `Clockwork`, toggle the optional `AM/PM` and `Day` layers.
  In `Orrery`, toggle the optional `Jupiter` and `Saturn` layers.

Use the right sidebar:

- `Play` starts and pauses the animation.
- `New Gear` lets you enter a tooth count and place a new gear.
- `Layers` lets you choose the active visible layer. Optional layers only appear here when enabled from the `Extra` menu.

Editing workflow:

1. Select a layer in the sidebar.
2. Enter a tooth count.
3. Click the gear button, then click or drag on the canvas to place the gear.
4. Drag an existing gear on the active layer to reposition it.
5. Click a gear to select it and inspect its rate.

Interaction notes:

- Gears mesh on the same layer and can align coaxially across layers.
- Selecting a gear loads that gear's tooth count into the tooth input for the next gear you create.
- Clicking into the tooth-count input clears gear selection.
- `Delete` or `Backspace` deletes the selected gear when text input is not focused.
- `Cmd+Z` or `Ctrl+Z` undoes editor actions.
- Right-click and drag pans the canvas.

The app starts centered on the main clock arbor, and the canvas is constrained to the viewport while the sidebar scrolls independently.
