
# KRuins ComfyUI Node Suite

**Render Beyond Imagination**

Developed by **Rampart** | [KineticRuins.com](https://kineticruins.com)

A collection of five custom ComfyUI nodes designed to simplify wildcard batch generation, display selected wildcard values, save images and videos with flexible filenames, and monitor rendering progress.

---

## Included Nodes

### 1. KRuins - Wildcard Batch

Generate multiple prompt variations using wildcard files.

**Features**
- Wildcard-based prompt generation
- Configurable batch size
- Seed control
- Positive and negative prompt inputs
- Batch-size checking against connected latent batches
- Supports workflows requiring individual prompt variations

### 2. KRuins - Show Text

Display the wildcard selections used during generation.

**Features**
- Readable text display inside ComfyUI
- Individual image headings
- Shows selected wildcard values
- Scrollable, resizable display
- Useful for reviewing generated batches

### 3. KRuins - Save Image

Save generated images with customizable filenames.

**Features**
- Four independently configurable filename positions
- Individual ON/OFF toggles
- Custom text, KSampler, Scheduler, Increment, and None options
- Automatic sampler and scheduler detection
- Live filename preview
- Windows folder-selection dialog
- Automatic shortening of long displayed folder paths
- Collision protection to prevent overwriting existing images
- PNG workflow metadata

**Example filename:**

`KRuins-euler-normal-0001.png`

Filename parts can be rearranged or disabled independently.

### 4. KRuins - Render ETA

Monitor workflow execution and sampling progress.

**Features**
- Live elapsed-time counter
- Sampling progress bar
- Sampling-step counter
- Estimated remaining sampling time
- Render-completion indication
- Timer reset on subsequent renders
- Full progress bar when execution completes

**Note:** Estimated remaining time applies to sampling. Other workflow stages, including decoding, upscaling, and saving, may require additional time.

The node monitors execution without requiring a connection to another node.

### 5. KRuins - Save Video

Save MP4 videos using customizable filenames.

**Features**
- VIDEO input and output
- Four independently configurable filename positions
- Individual ON/OFF toggles
- Custom text, KSampler, Scheduler, Increment, and None options
- Automatic sampler and scheduler detection
- Live MP4 filename preview
- Windows folder-selection dialog
- Automatic shortening of displayed folder paths
- Collision protection, including when Increment is disabled
- MP4 workflow metadata when supported

**Example filename:**

`KRuins-euler-normal-0001.mp4`

Existing files are preserved by automatically selecting an available filename.

---

## Installation

### Method 1 — ComfyUI Manager

Once the package is published to the ComfyUI Registry:

1. Open ComfyUI.
2. Open ComfyUI Manager.
3. Search for **KRuins ComfyUI Node Suite**.
4. Install the package.
5. Restart ComfyUI.

### Method 2 — GitHub

Clone the repository into your ComfyUI `custom_nodes` directory:

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/Rampart187/KRuins-ComfyUI-Node-Suite.git
```

Restart ComfyUI.

The nodes appear under the **KRuins** category.

---

## Filename Builder

Both Save Image and Save Video support four configurable filename positions.

Available choices:

| Choice | Description |
|---|---|
| Custom | User-defined filename text |
| KSampler | Detected sampler name |
| Scheduler | Detected scheduler name |
| Increment | Four-digit sequence number |
| None | Empty filename position |

Each position includes an independent toggle.

The actual filename is assembled using the enabled positions in the selected order.

For example:

`KRuins-euler-normal-0001.mp4`

Or, with the positions rearranged:

`normal-0001-KRuins-euler.mp4`

Collision protection prevents an existing file from being replaced, even if the Increment option is disabled.

The live preview illustrates the filename format. Its displayed increment may not represent the next available number already on disk.

---

## Folder Selection

Save Image and Save Video include a clickable folder-selection control.

On supported local Windows installations, clicking the control opens a native Windows folder browser.

Long destination paths are shortened visually to fit the node, while the complete path is preserved for saving.

**Platform note:** The native graphical folder picker currently requires Windows. Support for other operating systems has not yet been validated.

---

## Compatibility

- ComfyUI with support for the included node APIs
- Python 3.10 or newer
- Windows for the native folder-selection dialog
- VIDEO support for KRuins Save Video

The suite has been tested in a Windows ComfyUI environment. Compatibility with every ComfyUI version, extension combination, and operating system is not guaranteed.

---

## Important Notes

- Sampler and scheduler detection reads values from supported workflow nodes.
- Workflows with multiple sampler or scheduler nodes may require additional care because the detected value may not represent the intended stage.
- Render ETA values are estimates and may change during execution.
- When working with custom save locations, ensure ComfyUI has permission to write to the destination.
- Save Video outputs MP4 files. Codec availability depends on the local ComfyUI environment.

---

## Screenshots and Examples

Screenshots and example workflows will be added to demonstrate each of the five KRuins nodes.

---

## Support

For questions, bug reports, and suggestions, use the repository's GitHub Issues page:

https://github.com/Rampart187/KRuins-ComfyUI-Node-Suite/issues

Website: https://kineticruins.com

Developer: **Rampart**

---

## License

MIT License. See [LICENSE](LICENSE).

---

**KRuins — Render Beyond Imagination**
