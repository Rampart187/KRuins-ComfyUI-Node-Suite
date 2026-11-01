
from .kr_wildcard_batch import (
    NODE_CLASS_MAPPINGS as WILDCARD_NODES
)
from .kr_show_text import (
    NODE_CLASS_MAPPINGS as SHOW_TEXT_NODES
)
from .kr_save_image import (
    NODE_CLASS_MAPPINGS as SAVE_IMAGE_NODES
)
from .kr_render_eta import (
    NODE_CLASS_MAPPINGS as RENDER_ETA_NODES
)

# Save Video requires the newer ComfyUI V3 API.
# Older ComfyUI installations can still load the other four nodes.
try:
    from .kr_save_video import KRuinsSaveVideo
except (ImportError, AttributeError) as exc:
    KRuinsSaveVideo = None
    print(
        f"[KRuins] Save Video unavailable: {exc}. "
        "The other four nodes will remain available."
    )

NODE_CLASS_MAPPINGS = {
    **WILDCARD_NODES,
    **SHOW_TEXT_NODES,
    **SAVE_IMAGE_NODES,
    **RENDER_ETA_NODES,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "KRWildcardBatch": "KRuins - Wildcard Batch",
    "KRShowText": "KRuins - Show Text",
    "KRSaveImage": "KRuins - Save Image",
    "KRRenderETA": "KRuins - Render ETA",
}

if KRuinsSaveVideo is not None:
    NODE_CLASS_MAPPINGS["KRuinsSaveVideo"] = KRuinsSaveVideo
    NODE_DISPLAY_NAME_MAPPINGS["KRuinsSaveVideo"] = "KRuins - Save Video"

WEB_DIRECTORY = "./js"
