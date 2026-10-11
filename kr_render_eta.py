
class KRRenderETA:

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
        }

    RETURN_TYPES = ()
    FUNCTION = "run"
    OUTPUT_NODE = True
    CATEGORY = "KRuins"

    @classmethod
    def IS_CHANGED(cls):
        # Allow the display node to execute again
        # when a new workflow is queued.
        return float("nan")

    def run(self):
        return {
            "ui": {
                "status": ["Ready"]
            }
        }


NODE_CLASS_MAPPINGS = {
    "KRRenderETA": KRRenderETA
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "KRRenderETA": "KRuins - Render ETA"
}
