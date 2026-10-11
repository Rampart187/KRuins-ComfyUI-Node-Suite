
import os
import re
import random
import torch

PATTERN = re.compile(r"__([a-zA-Z0-9_/-]+)__")
MAX_DEPTH = 20


def wildcard_label(name):
    return name.split("/")[-1].replace("_", " ").title()


def read_choices(folder, name):
    path = os.path.join(folder, *name.split("/")) + ".txt"

    if not os.path.isfile(path):
        return None

    with open(path, "r", encoding="utf-8-sig") as f:
        return [
            line.strip()
            for line in f
            if line.strip() and not line.lstrip().startswith("#")
        ]


def expand(prompt, folder, rng):
    selections = []

    def resolve_text(text, depth=0, stack=()):
        if depth >= MAX_DEPTH:
            return text

        def replace(match):
            name = match.group(1)

            if name in stack:
                return match.group(0)

            choices = read_choices(folder, name)

            if choices is None:
                return match.group(0)

            if not choices:
                return match.group(0)

            value = rng.choice(choices)

            # Resolve every nested wildcard before recording.
            final_value = resolve_text(
                value,
                depth + 1,
                stack + (name,)
            )

            return final_value

        return PATTERN.sub(replace, text)

    # Resolve each top-level wildcard separately.
    # Only top-level selections appear in the report.
    def replace_top_level(match):
        name = match.group(1)
        choices = read_choices(folder, name)

        if choices is None:
            selections.append(
                (wildcard_label(name), "FILE NOT FOUND")
            )
            return match.group(0)

        if not choices:
            selections.append(
                (wildcard_label(name), "EMPTY WILDCARD")
            )
            return match.group(0)

        value = rng.choice(choices)
        final_value = resolve_text(value, 1, (name,))

        selections.append(
            (wildcard_label(name), final_value)
        )

        return final_value

    resolved = PATTERN.sub(replace_top_level, prompt)

    return resolved, selections


def encode_batch(clip, prompts):
    conds = []
    pooled = []

    for prompt in prompts:
        tokens = clip.tokenize(prompt)
        cond, pool = clip.encode_from_tokens(
            tokens, return_pooled=True
        )

        conds.append(cond)
        pooled.append(pool)

    max_tokens = max(c.shape[1] for c in conds)

    conds = [
        torch.nn.functional.pad(
            c, (0, 0, 0, max_tokens - c.shape[1])
        )
        for c in conds
    ]

    result = torch.cat(conds, dim=0)
    metadata = {}

    if all(p is not None for p in pooled):
        metadata["pooled_output"] = torch.cat(
            pooled, dim=0
        )

    return [[result, metadata]]


class KRWildcardBatch:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),

                "prompt": ("STRING", {
                    "multiline": True,
                    "default": (
                        "A photo of a __woman__ "
                        "with __hair__"
                    )
                }),

                "negative_prompt": ("STRING", {
                    "multiline": True,
                    "default": ""
                }),

                "wildcard_folder": ("STRING", {
                    "default": "D:/ComfyUI/ComfyUI/wildcards"
                }),

                "batch_size": ("INT", {
                    "default": 4,
                    "min": 1,
                    "max": 16
                }),

                "seed": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 0xffffffffffffffff
                }),
            }
        }

    RETURN_TYPES = (
        "CONDITIONING",
        "CONDITIONING",
        "STRING"
    )

    RETURN_NAMES = (
        "positive",
        "negative",
        "resolved_prompts"
    )

    FUNCTION = "run"
    CATEGORY = "KRuins"

    def run(
        self,
        clip,
        prompt,
        negative_prompt,
        wildcard_folder,
        batch_size,
        seed
    ):

        rng = random.Random(seed)

        positives = []
        negatives = []
        reports = []

        for i in range(batch_size):

            positive_text, selections = expand(
                prompt,
                wildcard_folder,
                rng
            )

            negative_text, _ = expand(
                negative_prompt,
                wildcard_folder,
                rng
            )

            positives.append(positive_text)
            negatives.append(negative_text)

            lines = [f"IMAGE {i + 1}:"]

            for label, value in selections:
                lines.append(f"{label}: {value}")
                lines.append("")

            if not selections:
                lines.append("No wildcards found")

            reports.append("\n".join(lines).strip())

        positive_cond = encode_batch(
            clip, positives
        )

        negative_cond = encode_batch(
            clip, negatives
        )

        separator = "\n\n" + "_" * 44 + "\n\n"
        report = separator.join(reports)

        return (
            positive_cond,
            negative_cond,
            report
        )


NODE_CLASS_MAPPINGS = {
    "KRWildcardBatch": KRWildcardBatch
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "KRWildcardBatch": "KRuins - Wildcard Batch"
}
