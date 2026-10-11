
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "KRuins.ShowText",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "KRShowText") return;

        const originalOnExecuted = nodeType.prototype.onExecuted;

        nodeType.prototype.onExecuted = function (message) {
            originalOnExecuted?.apply(this, arguments);

            const rawText = message?.text?.[0] || "";

            // Reuse the display instead of creating a new one
            // every time the workflow executes.
            if (!this.krDisplayWidget) {
                const container = document.createElement("div");

                Object.assign(container.style, {
                    width: "100%",
                    height: "100%",
                    minHeight: "0",
                    overflowY: "auto",
                    overflowX: "hidden",
                    boxSizing: "border-box",
                    background: "#202126",
                    color: "#eeeeee",
                    padding: "16px",
                    fontFamily: "Arial, sans-serif",
                    fontSize: "14px",
                    lineHeight: "1.6",
                    borderRadius: "8px",
                    userSelect: "text"
                });

                this.krContainer = container;

                this.krDisplayWidget = this.addDOMWidget(
                    "KRuins Wildcard Results",
                    "custom",
                    container,
                    {
                        serialize: false,
                        hideOnZoom: false,
                        getMinHeight: () => 80,
                        getMaxHeight: () => 100000
                    }
                );
            }

            const container = this.krContainer;
            container.replaceChildren();

            const lines = String(rawText).split(/\r?\n/);

            for (const line of lines) {
                const trimmed = line.trim();

                if (/^IMAGE \d+:?$/i.test(trimmed)) {
                    const heading = document.createElement("div");
                    heading.textContent = trimmed.replace(/:$/, "");

                    Object.assign(heading.style, {
                        fontSize: "24px",
                        fontWeight: "bold",
                        color: "#ffffff",
                        marginTop: "12px",
                        marginBottom: "12px"
                    });

                    container.appendChild(heading);
                }

                else if (/^_{10,}$/.test(trimmed)) {
                    const divider = document.createElement("hr");

                    Object.assign(divider.style, {
                        border: "none",
                        borderTop: "2px solid #777777",
                        margin: "20px 0"
                    });

                    container.appendChild(divider);
                }

                else if (trimmed) {
                    const item = document.createElement("div");
                    item.textContent = line;

                    Object.assign(item.style, {
                        whiteSpace: "pre-wrap",
                        overflowWrap: "anywhere",
                        marginBottom: "8px"
                    });

                    container.appendChild(item);
                }
            }

            this.setDirtyCanvas(true, true);
        };
    }
});
