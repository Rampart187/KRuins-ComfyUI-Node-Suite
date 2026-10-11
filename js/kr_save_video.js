
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const OPTIONS = [
    "Custom",
    "KSampler",
    "Scheduler",
    "Increment",
    "None"
];

const DEFAULT_PARTS = [
    "Custom",
    "KSampler",
    "Scheduler",
    "Increment"
];

const SAMPLER_TYPES = new Set([
    "KSampler",
    "KSamplerAdvanced",
    "KSamplerSelect"
]);

const SCHEDULER_TYPES = new Set([
    "KSampler",
    "KSamplerAdvanced",
    "BasicScheduler"
]);


// ---------------------------------------
// FILENAME HELPERS
// ---------------------------------------

function safeName(value) {
    return String(value)
        .trim()
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
        .replace(/[ .]+$/g, "") || "output";
}

function readWidget(node, name) {
    return node?.widgets?.find(
        widget => widget.name === name
    )?.value;
}

function findWorkflowValue(
    graph,
    types,
    field,
    fallback
) {
    if (!graph) return fallback;

    for (const node of graph._nodes || []) {
        if (!types.has(node.type)) continue;

        const value = readWidget(node, field);

        if (value !== undefined && value !== null) {
            const text = String(value).trim();

            if (text) {
                return safeName(text);
            }
        }
    }

    return fallback;
}


// ---------------------------------------
// DYNAMIC FOLDER PATH SHORTENING
// ---------------------------------------

const measureCanvas =
    document.createElement("canvas");

const measureContext =
    measureCanvas.getContext("2d");

function fitFolderPath(path, availableWidth) {
    const text = String(path || "");

    if (!text) {
        return "Click to Select Folder";
    }

    if (!measureContext) {
        return text.length > 30
            ? "..." + text.slice(-27)
            : text;
    }

    measureContext.font = "14px Arial";

    if (
        measureContext.measureText(text).width <=
        availableWidth
    ) {
        return text;
    }

    let shortened = text;

    while (
        shortened.length > 1 &&
        measureContext.measureText(
            "..." + shortened
        ).width > availableWidth
    ) {
        shortened = shortened.slice(1);
    }

    return "..." + shortened;
}


// ---------------------------------------
// REGISTER VIDEO INTERFACE
// ---------------------------------------

app.registerExtension({
    name: "KRuins.SaveVideoUI",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "KRuinsSaveVideo") {
            return;
        }

        const originalCreated =
            nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const result =
                originalCreated?.apply(this, arguments);

            const node = this;

            const getWidget = name =>
                node.widgets?.find(
                    widget => widget.name === name
                );

            const getValue = (
                name,
                fallback = ""
            ) => {
                return getWidget(name)?.value ?? fallback;
            };

            const setValue = (name, value) => {
                const widget = getWidget(name);

                if (!widget) return;

                widget.value = value;
                widget.callback?.(value);

                node.setDirtyCanvas(true, true);
            };

            function hideWidget(widget) {
                if (!widget) return;

                widget.type = "hidden";
                widget.hidden = true;
                widget.computeSize = () => [0, -4];
            }

            // -----------------------------------
            // DEFAULT DROPDOWN VALUES
            // -----------------------------------

            // New nodes start with:
            // Custom, KSampler, Scheduler, Increment.
            //
            // Existing workflow selections should
            // remain unchanged when serialized values
            // are restored.

            for (let i = 1; i <= 4; i++) {
                const widget = getWidget(`part_${i}`);

                if (
                    widget &&
                    (
                        widget.value === undefined ||
                        widget.value === null ||
                        widget.value === ""
                    )
                ) {
                    widget.value =
                        DEFAULT_PARTS[i - 1];
                }
            }

            // -----------------------------------
            // WINDOWS FOLDER PICKER
            // -----------------------------------

            const folderWidget =
                getWidget("destination");

            if (!folderWidget) {
                console.warn(
                    "[KRuins] Save Video destination " +
                    "widget not found."
                );

                return result;
            }

            const folderIndex =
                node.widgets.indexOf(folderWidget);

            hideWidget(folderWidget);

            let selectingFolder = false;
            let previousFolderLabel = "";

            const folderButton = node.addWidget(
                "button",
                "save_folder",
                null,
                async () => {
                    if (selectingFolder) return;

                    selectingFolder = true;
                    folderButton.name =
                        "Selecting folder...";

                    node.setDirtyCanvas(true, true);

                    try {
                        const currentPath = String(
                            getValue("destination", "")
                        );

                        const response =
                            await api.fetchApi(
                                "/kruins/select-image-folder",
                                {
                                    method: "POST",
                                    headers: {
                                        "Content-Type":
                                            "application/json"
                                    },
                                    body: JSON.stringify({
                                        initial_path:
                                            currentPath
                                    })
                                }
                            );

                        const data =
                            await response.json();

                        if (
                            !response.ok ||
                            data.error
                        ) {
                            throw new Error(
                                data.error ||
                                "Folder selection failed"
                            );
                        }

                        if (
                            !data.cancelled &&
                            typeof data.path === "string" &&
                            data.path.trim()
                        ) {
                            setValue(
                                "destination",
                                data.path.trim()
                            );
                        }

                    } catch (error) {
                        console.error(
                            "[KRuins] Video folder picker:",
                            error
                        );

                        alert(
                            "KRuins folder picker failed:\n" +
                            error.message
                        );

                    } finally {
                        selectingFolder = false;
                        previousFolderLabel = "";
                        updateFolderLabel();
                    }
                }
            );

            function updateFolderLabel() {
                if (selectingFolder) return;

                const fullPath = String(
                    getValue("destination", "")
                ).trim();

                const nodeWidth =
                    node.size?.[0] || 350;

                const prefix = "save_folder: ";

                const maxTextWidth = Math.max(
                    60,
                    nodeWidth - 105
                );

                const displayPath = fitFolderPath(
                    fullPath,
                    maxTextWidth
                );

                const newLabel =
                    prefix + displayPath;

                if (
                    previousFolderLabel !== newLabel
                ) {
                    folderButton.name = newLabel;
                    previousFolderLabel = newLabel;

                    node.setDirtyCanvas(true, true);
                }

                // Full path is never shortened
                // in the actual Python input.
                folderButton.options = {
                    ...folderButton.options,
                    serialize: false,
                    tooltip:
                        fullPath ||
                        "Click to select a video folder"
                };
            }

            const buttonIndex =
                node.widgets.indexOf(folderButton);

            if (
                folderIndex >= 0 &&
                buttonIndex >= 0
            ) {
                node.widgets.splice(
                    buttonIndex,
                    1
                );

                node.widgets.splice(
                    folderIndex,
                    0,
                    folderButton
                );
            }

            updateFolderLabel();

            // -----------------------------------
            // HIDE NATIVE FILENAME CONTROLS
            // -----------------------------------

            for (let i = 1; i <= 4; i++) {
                hideWidget(
                    getWidget(`part_${i}`)
                );

                hideWidget(
                    getWidget(`enable_${i}`)
                );
            }

            // -----------------------------------
            // FOUR DROPDOWNS AND TOGGLES
            // -----------------------------------

            const panel =
                document.createElement("div");

            Object.assign(panel.style, {
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                padding: "10px 12px",
                background: "#303030",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-evenly",
                gap: "9px",
                fontFamily: "Arial, sans-serif"
            });

            const rows = [];

            function createToggle(
                initial,
                callback
            ) {
                const label =
                    document.createElement("label");

                Object.assign(label.style, {
                    position: "relative",
                    width: "44px",
                    height: "24px",
                    flexShrink: "0",
                    cursor: "pointer",
                    display: "block"
                });

                const input =
                    document.createElement("input");

                input.type = "checkbox";
                input.checked = initial;

                Object.assign(input.style, {
                    position: "absolute",
                    opacity: "0",
                    width: "100%",
                    height: "100%",
                    margin: "0",
                    cursor: "pointer"
                });

                const track =
                    document.createElement("span");

                Object.assign(track.style, {
                    position: "absolute",
                    inset: "0",
                    borderRadius: "15px",
                    background: "#555555",
                    pointerEvents: "none"
                });

                const knob =
                    document.createElement("span");

                Object.assign(knob.style, {
                    position: "absolute",
                    width: "20px",
                    height: "20px",
                    top: "2px",
                    left: "2px",
                    borderRadius: "50%",
                    background: "#93a9cc",
                    transition:
                        "transform 0.15s",
                    pointerEvents: "none"
                });

                track.appendChild(knob);
                label.append(track, input);

                const update = () => {
                    track.style.background =
                        input.checked
                            ? "#425d78"
                            : "#555555";

                    knob.style.transform =
                        input.checked
                            ? "translateX(20px)"
                            : "translateX(0)";
                };

                input.addEventListener(
                    "change",
                    () => {
                        update();
                        callback(input.checked);
                    }
                );

                update();

                return {
                    label,
                    input,
                    update
                };
            }

            for (let i = 1; i <= 4; i++) {
                const row =
                    document.createElement("div");

                Object.assign(row.style, {
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    minHeight: "34px"
                });

                const select =
                    document.createElement("select");

                Object.assign(select.style, {
                    flex: "1",
                    width: "100%",
                    minWidth: "0",
                    height: "34px",
                    padding: "0 12px",
                    border: "1px solid #777777",
                    borderRadius: "18px",
                    background: "#242424",
                    color: "#eeeeee",
                    fontSize: "13px",
                    fontFamily: "Arial, sans-serif",
                    cursor: "pointer",
                    outline: "none",
                    boxSizing: "border-box"
                });

                for (const name of OPTIONS) {
                    const option =
                        document.createElement("option");

                    option.value = name;
                    option.textContent = name;

                    select.appendChild(option);
                }

                const toggle = createToggle(
                    Boolean(
                        getValue(
                            `enable_${i}`,
                            true
                        )
                    ),
                    checked => {
                        setValue(
                            `enable_${i}`,
                            checked
                        );

                        updatePreview();
                    }
                );

                select.addEventListener(
                    "change",
                    () => {
                        setValue(
                            `part_${i}`,
                            select.value
                        );

                        updatePreview();
                    }
                );

                row.append(
                    select,
                    toggle.label
                );

                panel.appendChild(row);

                rows.push({
                    index: i,
                    select,
                    toggle
                });
            }

            node.addDOMWidget(
                "Filename Controls",
                "custom",
                panel,
                {
                    serialize: false,
                    hideOnZoom: false,
                    getMinHeight: () => 210,
                    getMaxHeight: () => 210
                }
            );

            // -----------------------------------
            // LIVE FILENAME PREVIEW
            // -----------------------------------

            const preview =
                document.createElement("div");

            Object.assign(preview.style, {
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                padding: "12px",
                background: "#202126",
                borderRadius: "8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                gap: "7px",
                overflow: "hidden",
                fontFamily: "Arial, sans-serif"
            });

            const title =
                document.createElement("div");

            title.textContent =
                "Files will be saved as:";

            Object.assign(title.style, {
                color: "#ffffff",
                fontSize: "13px",
                fontWeight: "bold"
            });

            const filename =
                document.createElement("div");

            Object.assign(filename.style, {
                color: "#85e5a3",
                fontSize: "15px",
                fontWeight: "bold",
                lineHeight: "1.35",
                overflowWrap: "anywhere",
                wordBreak: "break-word"
            });

            preview.append(
                title,
                filename
            );

            node.addDOMWidget(
                "Filename Preview",
                "custom",
                preview,
                {
                    serialize: false,
                    hideOnZoom: false,
                    getMinHeight: () => 85,
                    getMaxHeight: () => 105
                }
            );

            function updatePreview() {
                const custom = safeName(
                    String(
                        getValue(
                            "custom_text",
                            "KRuins"
                        )
                    )
                );

                const sampler =
                    findWorkflowValue(
                        node.graph,
                        SAMPLER_TYPES,
                        "sampler_name",
                        "Sampler"
                    );

                const scheduler =
                    findWorkflowValue(
                        node.graph,
                        SCHEDULER_TYPES,
                        "scheduler",
                        "Scheduler"
                    );

                const examples = {
                    Custom: custom,
                    KSampler: sampler,
                    Scheduler: scheduler,
                    Increment: "0001",
                    None: ""
                };

                const parts = [];

                for (const row of rows) {
                    const choice = getValue(
                        `part_${row.index}`,
                        DEFAULT_PARTS[
                            row.index - 1
                        ]
                    );

                    const enabled = Boolean(
                        getValue(
                            `enable_${row.index}`,
                            true
                        )
                    );

                    row.select.value = choice;
                    row.toggle.input.checked =
                        enabled;

                    row.toggle.update();

                    row.select.style.opacity =
                        enabled ? "1" : "0.45";

                    if (
                        enabled &&
                        choice !== "None"
                    ) {
                        parts.push(
                            examples[choice] ||
                            choice
                        );
                    }
                }

                filename.textContent =
                    (parts.join("-") || "KRuins") +
                    ".mp4";

                updateFolderLabel();
            }

            node.krVideoFilenameTimer =
                setInterval(
                    updatePreview,
                    300
                );

            updatePreview();

            // -----------------------------------
            // CLEANUP
            // -----------------------------------

            const originalRemoved =
                node.onRemoved;

            node.onRemoved = function () {
                clearInterval(
                    node.krVideoFilenameTimer
                );

                originalRemoved?.apply(
                    this,
                    arguments
                );
            };

            // -----------------------------------
            // NODE DIMENSIONS
            // -----------------------------------

            const currentWidth = Math.max(
                node.size?.[0] || 350,
                350
            );

            const requiredHeight = Math.max(
                node.computeSize()[1],
                450
            );

            node.setSize([
                currentWidth,
                requiredHeight
            ]);

            return result;
        };
    }
});
