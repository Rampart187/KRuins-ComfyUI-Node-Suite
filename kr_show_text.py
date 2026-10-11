
class KRShowText:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"forceInput": True}),
            }
        }

    RETURN_TYPES = ()
    FUNCTION = "show_text"
    OUTPUT_NODE = True
    CATEGORY = "KRuins"

    def show_text(self, text):
        return {
            "ui": {"text": [text]},
            "result": ()
        }


NODE_CLASS_MAPPINGS = {
    "KRShowText": KRShowText
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "KRShowText": "KRuins - Show Text"
}
