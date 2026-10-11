
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

from .kr_save_video import KRuinsSaveVideo


# Register existing V1 nodes
NODE_CLASS_MAPPINGS = {
    **WILDCARD_NODES,
    **SHOW_TEXT_NODES,
    **SAVE_IMAGE_NODES,
    **RENDER_ETA_NODES,
}

# Register the V3 Save Video node
# through the same mapping.
NODE_CLASS_MAPPINGS["KRuinsSaveVideo"] = KRuinsSaveVideo


NODE_DISPLAY_NAME_MAPPINGS = {
    "KRWildcardBatch": "KRuins - Wildcard Batch",
    "KRShowText": "KRuins - Show Text",
    "KRSaveImage": "KRuins - Save Image",
    "KRRenderETA": "KRuins - Render ETA",
    "KRuinsSaveVideo": "KRuins - Save Video",
}

WEB_DIRECTORY = "./js"
