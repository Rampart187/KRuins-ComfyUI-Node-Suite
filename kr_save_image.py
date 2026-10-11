
import os
import re
import json
import asyncio
import threading
import ipaddress
import subprocess
import base64
import numpy as np

from PIL import Image
from PIL.PngImagePlugin import PngInfo
from aiohttp import web

import folder_paths
from server import PromptServer


OPTIONS = [
    "Custom",
    "KSampler",
    "Scheduler",
    "Increment",
    "None"
]

_folder_dialog_lock = threading.Lock()


def safe_name(value):
    value = str(value).strip()
    value = re.sub(
        r'[<>:"/\\|?*\x00-\x1f]',
        "-",
        value
    )
    return value.rstrip(" .") or "output"


def get_nodes(prompt):
    if not isinstance(prompt, dict):
        return []

    if isinstance(prompt.get("prompt"), dict):
        prompt = prompt["prompt"]

    return [
        node for node in prompt.values()
        if isinstance(node, dict)
        and "inputs" in node
    ]


def find_value(prompt, classes, field):
    for node in get_nodes(prompt):
        if node.get("class_type") in classes:
            value = node.get("inputs", {}).get(field)

            if isinstance(value, (str, int, float)):
                return str(value)

    return None


def get_sampler(prompt):
    value = find_value(
        prompt,
        {
            "KSampler",
            "KSamplerAdvanced",
            "KSamplerSelect"
        },
        "sampler_name"
    )

    return safe_name(value or "Sampler")


def get_scheduler(prompt):
    value = find_value(
        prompt,
        {
            "KSampler",
            "KSamplerAdvanced",
            "BasicScheduler"
        },
        "scheduler"
    )

    return safe_name(value or "Scheduler")


# ---------------------------------------
# WINDOWS FOLDER PICKER
# Foreground window support
# ---------------------------------------

def choose_windows_folder(initial_path=""):

    if os.name != "nt":
        raise RuntimeError(
            "Folder picker requires Windows."
        )

    environment = os.environ.copy()

    if initial_path and os.path.isdir(initial_path):
        environment["KRUINS_INITIAL_DIR"] = (
            os.path.abspath(initial_path)
        )
    else:
        environment["KRUINS_INITIAL_DIR"] = ""

    powershell_script = r'''
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$dialog = New-Object System.Windows.Forms.FolderBrowserDialog

$dialog.Description = "KRuins - Select Image Save Folder"
$dialog.ShowNewFolderButton = $true

$initial = $env:KRUINS_INITIAL_DIR

if (
    $initial -and
    (Test-Path -LiteralPath $initial -PathType Container)
) {
    $dialog.SelectedPath = $initial
}

# Create a real visible owner window so the folder
# dialog can be activated instead of staying behind Chrome.
$owner = New-Object System.Windows.Forms.Form

$owner.Text = "KRuins Folder Picker"
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.StartPosition = "CenterScreen"
$owner.ShowInTaskbar = $true
$owner.TopMost = $true
$owner.Opacity = 0.01

try {
    $owner.Show()
    $owner.Activate()
    $owner.BringToFront()

    [System.Windows.Forms.Application]::DoEvents()

    # Request foreground focus for our picker process.
    $shell = New-Object -ComObject WScript.Shell
    [void]$shell.AppActivate(
        [System.Diagnostics.Process]::GetCurrentProcess().Id
    )

    $result = $dialog.ShowDialog($owner)

    if (
        $result -eq
        [System.Windows.Forms.DialogResult]::OK
    ) {
        [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
        Write-Output $dialog.SelectedPath
    }
}
finally {
    $dialog.Dispose()
    $owner.Close()
    $owner.Dispose()
}
'''

    encoded = base64.b64encode(
        powershell_script.encode("utf-16le")
    ).decode("ascii")

    creationflags = getattr(
        subprocess,
        "CREATE_NO_WINDOW",
        0
    )

    try:
        result = subprocess.run(
            [
                "powershell.exe",
                "-NoProfile",
                "-STA",
                "-NonInteractive",
                "-EncodedCommand",
                encoded
            ],
            capture_output=True,
            text=True,
            encoding="utf-8-sig",
            errors="replace",
            env=environment,
            creationflags=creationflags,
            timeout=300
        )

    except subprocess.TimeoutExpired:
        raise RuntimeError(
            "Folder selection timed out."
        )

    except FileNotFoundError:
        raise RuntimeError(
            "Windows PowerShell was not found."
        )

    if result.returncode != 0:
        raise RuntimeError(
            "Windows folder picker failed: "
            + result.stderr.strip()
        )

    selected = result.stdout.strip()

    if not selected:
        return ""

    if not os.path.isdir(selected):
        raise RuntimeError(
            "Selected directory does not exist."
        )

    return os.path.abspath(selected)


# ---------------------------------------
# LOCAL REQUEST VALIDATION
# ---------------------------------------

def is_local_request(request):

    try:
        peer = ipaddress.ip_address(
            request.remote or ""
        )

        if not peer.is_loopback:
            return False

        host = request.host.split(":")[0].lower()

        if host not in (
            "localhost",
            "127.0.0.1",
            "[::1]"
        ):
            return False

        origin = request.headers.get("Origin", "")

        if origin:
            from urllib.parse import urlparse

            parsed = urlparse(origin)

            if parsed.hostname not in (
                "localhost",
                "127.0.0.1",
                "::1"
            ):
                return False

            if parsed.scheme not in (
                "http",
                "https"
            ):
                return False

            if parsed.port != 8188:
                return False

        return True

    except (ValueError, TypeError):
        return False


# ---------------------------------------
# FOLDER PICKER API
# ---------------------------------------

@PromptServer.instance.routes.post(
    "/kruins/select-image-folder"
)
async def kruins_select_image_folder(request):

    if not is_local_request(request):
        return web.json_response(
            {
                "error": (
                    "Folder selection is available "
                    "only from local ComfyUI."
                )
            },
            status=403
        )

    if os.name != "nt":
        return web.json_response(
            {
                "error": (
                    "Native folder selection "
                    "requires Windows."
                )
            },
            status=400
        )

    try:
        data = await request.json()
    except Exception:
        data = {}

    initial_path = data.get(
        "initial_path", ""
    )

    if not isinstance(initial_path, str):
        initial_path = ""

    if not _folder_dialog_lock.acquire(
        blocking=False
    ):
        return web.json_response(
            {
                "error": (
                    "A folder selection dialog "
                    "is already open."
                )
            },
            status=409
        )

    try:
        selected = await asyncio.to_thread(
            choose_windows_folder,
            initial_path
        )

        return web.json_response({
            "success": True,
            "cancelled": not bool(selected),
            "path": selected
        })

    except Exception as error:
        return web.json_response(
            {"error": str(error)},
            status=500
        )

    finally:
        _folder_dialog_lock.release()


# ---------------------------------------
# KRuins SAVE IMAGE
# ---------------------------------------

class KRSaveImage:

    @classmethod
    def INPUT_TYPES(cls):

        return {
            "required": {

                "images": ("IMAGE",),

                "save_folder": ("STRING", {
                    "default": "",
                    "tooltip": (
                        "Click to select an image "
                        "save folder. Empty uses "
                        "ComfyUI/output."
                    )
                }),

                "custom_text": ("STRING", {
                    "default": "KRuins"
                }),

                "part_1": (
                    OPTIONS,
                    {"default": "Custom"}
                ),

                "enable_1": (
                    "BOOLEAN",
                    {"default": True}
                ),

                "part_2": (
                    OPTIONS,
                    {"default": "KSampler"}
                ),

                "enable_2": (
                    "BOOLEAN",
                    {"default": True}
                ),

                "part_3": (
                    OPTIONS,
                    {"default": "Scheduler"}
                ),

                "enable_3": (
                    "BOOLEAN",
                    {"default": True}
                ),

                "part_4": (
                    OPTIONS,
                    {"default": "Increment"}
                ),

                "enable_4": (
                    "BOOLEAN",
                    {"default": True}
                ),
            },

            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO"
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "save_images"
    OUTPUT_NODE = True
    CATEGORY = "KRuins"

    def save_images(
        self,
        images,
        save_folder,
        custom_text,
        part_1,
        enable_1,
        part_2,
        enable_2,
        part_3,
        enable_3,
        part_4,
        enable_4,
        prompt=None,
        extra_pnginfo=None
    ):

        output_root = os.path.abspath(
            folder_paths.get_output_directory()
        )

        save_folder = os.path.expandvars(
            os.path.expanduser(
                save_folder.strip()
            )
        )

        if not save_folder:
            destination = output_root

        elif os.path.isabs(save_folder):
            destination = save_folder

        else:
            destination = os.path.join(
                output_root,
                save_folder
            )

        destination = os.path.abspath(destination)

        os.makedirs(
            destination,
            exist_ok=True
        )

        sampler = get_sampler(prompt)
        scheduler = get_scheduler(prompt)

        selected = [
            (part_1, enable_1),
            (part_2, enable_2),
            (part_3, enable_3),
            (part_4, enable_4)
        ]

        values = {
            "Custom": safe_name(custom_text),
            "KSampler": sampler,
            "Scheduler": scheduler
        }

        use_increment = any(
            enabled and choice == "Increment"
            for choice, enabled in selected
        )

        def build_name(number):
            parts = []

            for choice, enabled in selected:

                if not enabled:
                    continue

                if choice == "None":
                    continue

                if choice == "Increment":
                    parts.append(
                        f"{number:04d}"
                    )

                else:
                    parts.append(
                        values[choice]
                    )

            return "-".join(parts) or "KRuins"

        metadata = PngInfo()

        if prompt is not None:
            metadata.add_text(
                "prompt",
                json.dumps(prompt)
            )

        if extra_pnginfo is not None:
            for key, value in extra_pnginfo.items():
                metadata.add_text(
                    str(key),
                    json.dumps(value)
                )

        results = []
        counter = 1

        try:
            output_inside = (
                os.path.commonpath([
                    os.path.normcase(output_root),
                    os.path.normcase(destination)
                ])
                == os.path.normcase(output_root)
            )

        except ValueError:
            output_inside = False

        for image in images:

            array = np.clip(
                image.cpu().numpy() * 255,
                0,
                255
            ).astype(np.uint8)

            pil_image = Image.fromarray(array)

            while True:

                base = build_name(counter)

                if use_increment:
                    filename = base + ".png"

                elif counter == 1:
                    filename = base + ".png"

                else:
                    filename = (
                        f"{base}-{counter:04d}.png"
                    )

                full_path = os.path.join(
                    destination,
                    filename
                )

                if not os.path.exists(full_path):
                    break

                counter += 1

            pil_image.save(
                full_path,
                pnginfo=metadata,
                compress_level=4
            )

            counter += 1

            if output_inside:

                subfolder = os.path.relpath(
                    destination,
                    output_root
                )

                if subfolder == ".":
                    subfolder = ""

                results.append({
                    "filename": filename,
                    "subfolder": subfolder.replace(
                        "\\", "/"
                    ),
                    "type": "output"
                })

        return {
            "ui": {
                "images": results
            }
        }


NODE_CLASS_MAPPINGS = {
    "KRSaveImage": KRSaveImage
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "KRSaveImage": "KRuins - Save Image"
}
