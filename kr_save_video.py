
import os
import re
import threading

import folder_paths

from comfy_api.latest import io, ui, Input, Types
from comfy.cli_args import args


# ---------------------------------------
# FILENAME OPTIONS
# ---------------------------------------

OPTIONS = [
    "Custom",
    "KSampler",
    "Scheduler",
    "Increment",
    "None"
]

_save_lock = threading.Lock()


# ---------------------------------------
# SAFE FILENAMES
# ---------------------------------------

def safe_name(value):
    value = str(value).strip()
    value = re.sub(
        r'[<>:"/\\|?*\x00-\x1f]',
        "-",
        value
    )
    return value.rstrip(" .") or "output"


# ---------------------------------------
# PROMPT LOOKUP
# ---------------------------------------

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
# DESTINATION
# ---------------------------------------

def get_destination(destination):
    output_root = os.path.abspath(
        folder_paths.get_output_directory()
    )

    destination = os.path.expandvars(
        os.path.expanduser(
            str(destination or "").strip()
        )
    )

    if not destination:
        destination = output_root

    elif os.path.isabs(destination):
        destination = os.path.abspath(destination)

    else:
        destination = os.path.abspath(
            os.path.join(output_root, destination)
        )

    os.makedirs(destination, exist_ok=True)

    return output_root, destination


# ---------------------------------------
# VIDEO NODE
# ---------------------------------------

class KRuinsSaveVideo(io.ComfyNode):

    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="KRuinsSaveVideo",
            display_name="KRuins - Save Video",
            search_aliases=[
                "k ruins save video",
                "kinetic ruins save video"
            ],
            category="KRuins",
            description=(
                "Save MP4 videos with four customizable "
                "filename parts and automatic collision "
                "protection."
            ),
            inputs=[
                io.Video.Input("video"),

                io.String.Input(
                    "destination",
                    default="",
                    tooltip=(
                        "Click the folder button to select "
                        "a destination. Empty uses "
                        "ComfyUI/output."
                    )
                ),

                io.String.Input(
                    "custom_text",
                    default="KRuins"
                ),

                io.Combo.Input(
                    "part_1",
                    options=OPTIONS
                ),

                io.Boolean.Input(
                    "enable_1",
                    default=True
                ),

                io.Combo.Input(
                    "part_2",
                    options=OPTIONS
                ),

                io.Boolean.Input(
                    "enable_2",
                    default=True
                ),

                io.Combo.Input(
                    "part_3",
                    options=OPTIONS
                ),

                io.Boolean.Input(
                    "enable_3",
                    default=True
                ),

                io.Combo.Input(
                    "part_4",
                    options=OPTIONS
                ),

                io.Boolean.Input(
                    "enable_4",
                    default=True
                )
            ],
            hidden=[
                io.Hidden.prompt,
                io.Hidden.extra_pnginfo
            ],
            is_output_node=True,
            outputs=[
                io.Video.Output("video")
            ]
        )

    @classmethod
    def execute(
        cls,
        video: Input.Video,
        destination: str,
        custom_text: str,
        part_1: str,
        enable_1: bool,
        part_2: str,
        enable_2: bool,
        part_3: str,
        enable_3: bool,
        part_4: str,
        enable_4: bool
    ) -> io.NodeOutput:

        prompt = cls.hidden.prompt

        # -----------------------------------
        # DESTINATION FOLDER
        # -----------------------------------

        output_root, save_dir = get_destination(
            destination
        )

        # -----------------------------------
        # SAMPLER AND SCHEDULER
        # -----------------------------------

        sampler = get_sampler(prompt)
        scheduler = get_scheduler(prompt)

        # -----------------------------------
        # FOUR FILENAME POSITIONS
        # -----------------------------------

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
                    parts.append(f"{number:04d}")

                else:
                    parts.append(
                        values.get(choice, "output")
                    )

            return "-".join(parts) or "KRuins"

        # -----------------------------------
        # WORKFLOW METADATA
        # -----------------------------------

        metadata = None

        if not args.disable_metadata:
            metadata_dict = {}

            if cls.hidden.extra_pnginfo is not None:
                metadata_dict.update(
                    cls.hidden.extra_pnginfo
                )

            if prompt is not None:
                metadata_dict["prompt"] = prompt

            if metadata_dict:
                metadata = metadata_dict

        # -----------------------------------
        # COLLISION-PROTECTED MP4 SAVE
        # -----------------------------------

        with _save_lock:
            number = 1

            while True:
                base = build_name(number)

                if use_increment:
                    filename = base + ".mp4"

                elif number == 1:
                    filename = base + ".mp4"

                else:
                    filename = (
                        f"{base}-{number:04d}.mp4"
                    )

                full_path = os.path.join(
                    save_dir,
                    filename
                )

                if not os.path.exists(full_path):
                    break

                number += 1

            video.save_to(
                full_path,
                format=Types.VideoContainer.MP4,
                codec=Types.VideoCodec.AUTO,
                metadata=metadata
            )

        # -----------------------------------
        # STANDARD VIDEO PREVIEW
        # -----------------------------------

        try:
            inside = (
                os.path.commonpath([
                    os.path.normcase(output_root),
                    os.path.normcase(full_path)
                ]) == os.path.normcase(output_root)
            )

        except ValueError:
            inside = False

        if inside:
            relative = os.path.relpath(
                full_path,
                output_root
            ).replace("\\", "/")

            subfolder, _, file_only = (
                relative.rpartition("/")
            )

            return io.NodeOutput(
                video,
                ui=ui.PreviewVideo([
                    ui.SavedResult(
                        file_only,
                        subfolder,
                        io.FolderType.output
                    )
                ])
            )

        return io.NodeOutput(video)
