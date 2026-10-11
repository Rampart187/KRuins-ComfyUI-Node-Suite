
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

app.registerExtension({
    name: "KRuins.RenderETA",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "KRRenderETA") return;

        const originalCreated =
            nodeType.prototype.onNodeCreated;

        nodeType.prototype.onNodeCreated = function () {
            const result =
                originalCreated?.apply(this, arguments);

            const node = this;

            // ------------------------------------
            // RENDER TRACKING
            // ------------------------------------

            let running = false;
            let completed = false;
            let startTime = 0;
            let elapsed = 0;

            let currentNode = null;
            let stepsDone = 0;
            let totalSteps = 0;
            let samplingStart = 0;
            let estimatedRemaining = null;

            let statusText = "Ready";
            let lastExecutionId = null;

            function formatTime(seconds) {
                if (
                    seconds === null ||
                    !Number.isFinite(seconds)
                ) {
                    return "--:--";
                }

                const total = Math.max(
                    0,
                    Math.floor(seconds)
                );

                const hours = Math.floor(total / 3600);
                const minutes = Math.floor(
                    (total % 3600) / 60
                );
                const secs = total % 60;

                if (hours > 0) {
                    return (
                        String(hours).padStart(2, "0") +
                        ":" +
                        String(minutes).padStart(2, "0") +
                        ":" +
                        String(secs).padStart(2, "0")
                    );
                }

                return (
                    String(minutes).padStart(2, "0") +
                    ":" +
                    String(secs).padStart(2, "0")
                );
            }

            // ------------------------------------
            // DISPLAY
            // ------------------------------------

            const panel = document.createElement("div");

            Object.assign(panel.style, {
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                padding: "14px",
                background: "#202126",
                borderRadius: "10px",
                fontFamily: "Arial, sans-serif",
                color: "#eeeeee",
                display: "flex",
                flexDirection: "column",
                gap: "11px"
            });

            function makeText(
                content,
                size = "13px",
                color = "#eeeeee"
            ) {
                const element =
                    document.createElement("div");

                element.textContent = content;

                Object.assign(element.style, {
                    fontSize: size,
                    color,
                    lineHeight: "1.3"
                });

                return element;
            }

            const header = makeText(
                "RENDER MONITOR",
                "14px",
                "#ffffff"
            );

            header.style.fontWeight = "bold";

            const status = makeText(
                "Ready",
                "13px",
                "#93a9cc"
            );

            const progressTrack =
                document.createElement("div");

            Object.assign(progressTrack.style, {
                width: "100%",
                height: "15px",
                background: "#454545",
                borderRadius: "10px",
                overflow: "hidden",
                flexShrink: "0"
            });

            const progressFill =
                document.createElement("div");

            Object.assign(progressFill.style, {
                width: "0%",
                height: "100%",
                background: "#65bd86",
                borderRadius: "10px",
                transition: "width 0.2s ease"
            });

            progressTrack.appendChild(progressFill);

            const progressLabel = makeText(
                "Waiting for render",
                "12px",
                "#cccccc"
            );

            const timingRow =
                document.createElement("div");

            Object.assign(timingRow.style, {
                display: "flex",
                justifyContent: "space-between",
                gap: "10px"
            });

            function makeTimingColumn(label) {
                const column =
                    document.createElement("div");

                const caption = makeText(
                    label,
                    "11px",
                    "#aaaaaa"
                );

                const value = makeText(
                    "--:--",
                    "21px",
                    "#ffffff"
                );

                value.style.fontWeight = "bold";
                value.style.fontVariantNumeric =
                    "tabular-nums";

                column.append(caption, value);

                return { column, value };
            }

            const elapsedColumn =
                makeTimingColumn("ELAPSED");

            const remainingColumn =
                makeTimingColumn("SAMPLING LEFT");

            timingRow.append(
                elapsedColumn.column,
                remainingColumn.column
            );

            const detail = makeText(
                "No active render",
                "12px",
                "#aaaaaa"
            );

            panel.append(
                header,
                status,
                progressTrack,
                progressLabel,
                timingRow,
                detail
            );

            node.addDOMWidget(
                "KRuins Render Monitor",
                "custom",
                panel,
                {
                    serialize: false,
                    hideOnZoom: false,
                    getMinHeight: () => 235,
                    getMaxHeight: () => 235
                }
            );

            // ------------------------------------
            // UPDATE DISPLAY
            // ------------------------------------

            function updateDisplay() {
                if (running) {
                    elapsed =
                        (performance.now() - startTime) / 1000;
                }

                elapsedColumn.value.textContent =
                    formatTime(elapsed);

                remainingColumn.value.textContent =
                    formatTime(estimatedRemaining);

                status.textContent = statusText;

                if (running || completed) {
                    status.style.color = "#85e5a3";
                } else {
                    status.style.color = "#93a9cc";
                }

                if (totalSteps > 0) {
                    const percentage = Math.max(
                        0,
                        Math.min(
                            100,
                            (stepsDone / totalSteps) * 100
                        )
                    );

                    progressFill.style.width =
                        percentage.toFixed(1) + "%";

                    // FIX: Keep completion label at 100%
                    progressLabel.textContent = completed
                        ? "100% — Render Complete"
                        : percentage.toFixed(1) +
                          "% — Step " +
                          stepsDone +
                          " / " +
                          totalSteps;
                } else {
                    progressFill.style.width = "0%";

                    progressLabel.textContent =
                        running
                            ? "Waiting for sampling progress"
                            : completed
                                ? "Execution finished"
                                : "Waiting for render";
                }

                if (running) {
                    detail.textContent =
                        currentNode
                            ? "Executing node: " + currentNode
                            : "Workflow is running";
                } else if (completed) {
                    detail.textContent =
                        "Total elapsed: " +
                        formatTime(elapsed);
                } else {
                    detail.textContent = "No active render";
                }
            }

            // ------------------------------------
            // EXECUTION EVENTS
            // ------------------------------------

            function resetForRender() {
                running = true;
                completed = false;
                startTime = performance.now();
                elapsed = 0;

                currentNode = null;
                stepsDone = 0;
                totalSteps = 0;
                samplingStart = 0;
                estimatedRemaining = null;

                statusText = "Rendering...";
                updateDisplay();
            }

            function onExecutionStart(event) {
                lastExecutionId =
                    event?.detail?.prompt_id ?? null;

                resetForRender();
            }

            function onExecuting(event) {
                if (!running) return;

                const nodeId = event.detail;

                if (
                    nodeId === null ||
                    nodeId === undefined
                ) {
                    finishRender();
                    return;
                }

                if (String(nodeId) !== String(currentNode)) {
                    currentNode = nodeId;
                    stepsDone = 0;
                    totalSteps = 0;
                    samplingStart = 0;
                    estimatedRemaining = null;
                }

                statusText = "Rendering...";
                updateDisplay();
            }

            function onProgress(event) {
                const data = event.detail || {};

                if (!running) return;

                const value = Number(data.value);
                const max = Number(data.max);

                if (
                    !Number.isFinite(value) ||
                    !Number.isFinite(max) ||
                    max <= 0
                ) {
                    return;
                }

                if (
                    data.node !== undefined &&
                    data.node !== null
                ) {
                    if (
                        currentNode !== null &&
                        String(data.node) !==
                        String(currentNode)
                    ) {
                        stepsDone = 0;
                        samplingStart = 0;
                    }

                    currentNode = data.node;
                }

                if (
                    totalSteps !== max ||
                    value < stepsDone
                ) {
                    samplingStart = 0;
                    estimatedRemaining = null;
                }

                totalSteps = max;
                stepsDone = Math.max(
                    0,
                    Math.min(value, max)
                );

                if (!samplingStart) {
                    samplingStart = performance.now();
                }

                const samplingElapsed =
                    (performance.now() -
                        samplingStart) / 1000;

                if (
                    stepsDone > 1 &&
                    samplingElapsed > 0
                ) {
                    const secondsPerStep =
                        samplingElapsed /
                        (stepsDone - 1);

                    estimatedRemaining =
                        secondsPerStep *
                        (totalSteps - stepsDone);
                }

                statusText = "Sampling...";
                updateDisplay();
            }

            function finishRender() {
                if (!running) return;

                elapsed =
                    (performance.now() - startTime) / 1000;

                running = false;
                completed = true;
                estimatedRemaining = 0;
                currentNode = null;

                // FIX: Keep the completed progress bar full
                stepsDone = 100;
                totalSteps = 100;

                statusText = "Render Complete";
                updateDisplay();
            }

            function onExecutionError() {
                if (!running) return;

                elapsed =
                    (performance.now() - startTime) / 1000;

                running = false;
                completed = false;
                estimatedRemaining = null;

                statusText = "Render Error";
                updateDisplay();
            }

            function onExecutionInterrupted() {
                if (!running) return;

                elapsed =
                    (performance.now() - startTime) / 1000;

                running = false;
                completed = false;
                estimatedRemaining = null;

                statusText = "Render Interrupted";
                updateDisplay();
            }

            // ------------------------------------
            // REGISTER LISTENERS
            // ------------------------------------

            const listeners = [
                ["execution_start", onExecutionStart],
                ["executing", onExecuting],
                ["progress", onProgress],
                ["execution_success", finishRender],
                ["execution_error", onExecutionError],
                [
                    "execution_interrupted",
                    onExecutionInterrupted
                ]
            ];

            for (const [name, handler] of listeners) {
                api.addEventListener(name, handler);
            }

            const timer = setInterval(
                updateDisplay,
                250
            );

            // ------------------------------------
            // CLEANUP
            // ------------------------------------

            const originalRemoved = node.onRemoved;

            node.onRemoved = function () {
                clearInterval(timer);

                for (const [name, handler] of listeners) {
                    api.removeEventListener(name, handler);
                }

                originalRemoved?.apply(this, arguments);
            };

            // ------------------------------------
            // NODE DIMENSIONS
            // ------------------------------------

            const width = Math.max(
                node.size[0],
                340
            );

            const height = Math.max(
                node.computeSize()[1],
                290
            );

            node.setSize([width, height]);

            updateDisplay();

            return result;
        };
    }
});
