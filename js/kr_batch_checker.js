
import { app } from "../../scripts/app.js";

function findBatchStatus(node) {
    const graph = node.graph;

    if (!graph) {
        return { type: "unknown", message: "Waiting for workflow" };
    }

    const batchWidget = node.widgets?.find(
        w => w.name === "batch_size"
    );

    const requested = Number(batchWidget?.value);

    if (!Number.isFinite(requested)) {
        return { type: "unknown", message: "Batch size unavailable" };
    }

    // Find a KSampler connected to our conditioning outputs.
    const samplerTypes = ["KSampler", "KSamplerAdvanced"];
    let sampler = null;

    for (const output of (node.outputs || []).slice(0, 2)) {
        for (const linkId of output.links || []) {
            const link = graph.links[linkId];
            if (!link) continue;

            const target = graph.getNodeById(link.target_id);

            if (target && samplerTypes.includes(target.type)) {
                sampler = target;
                break;
            }
        }

        if (sampler) break;
    }

    if (!sampler) {
        return {
            type: "unknown",
            message: "Connect to KSampler to check batch size"
        };
    }

    // Find KSampler's latent source.
    const latentInput = sampler.inputs?.find(
        input => input.name === "latent_image"
    );

    if (!latentInput || latentInput.link == null) {
        return {
            type: "unknown",
            message: "Connect Empty Latent to KSampler"
        };
    }

    const latentLink = graph.links[latentInput.link];
    const latentNode = latentLink
        ? graph.getNodeById(latentLink.origin_id)
        : null;

    if (!latentNode) {
        return {
            type: "unknown",
            message: "Latent source unavailable"
        };
    }

    // This version checks direct Empty Latent connections.
    const supportedTypes = [
        "EmptyLatentImage",
        "EmptySD3LatentImage",
        "EmptyLatentImagePresets"
    ];

    if (!supportedTypes.includes(latentNode.type)) {
        return {
            type: "unknown",
            message: "Cannot verify this latent source"
        };
    }

    const latentWidget = latentNode.widgets?.find(
        w => w.name === "batch_size"
    );

    const actual = Number(latentWidget?.value);

    if (!Number.isFinite(actual)) {
        return {
            type: "unknown",
            message: "Latent batch size unavailable"
        };
    }

    if (requested === actual) {
        return {
            type: "matched",
            message: `MATCHED — Batch Size ${requested}`
        };
    }

    return {
        type: "mismatch",
        message:
            `DOES NOT EQUAL LATENT BATCH SIZE ` +
            `(${requested} vs ${actual})`
    };
}


app.registerExtension({
    name: "KRuins.BatchChecker",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "KRWildcardBatch") return;

        const originalCreated = nodeType.prototype.onNodeCreated;
        const originalRemoved = nodeType.prototype.onRemoved;

        nodeType.prototype.onNodeCreated = function () {
            const result = originalCreated?.apply(this, arguments);

            const display = document.createElement("div");

            Object.assign(display.style, {
                boxSizing: "border-box",
                width: "100%",
                padding: "7px 10px",
                borderRadius: "6px",
                textAlign: "center",
                fontSize: "12px",
                fontWeight: "bold",
                color: "#aaaaaa",
                background: "#303030",
                overflowWrap: "anywhere"
            });

            display.textContent = "Checking latent batch size...";

            this.addDOMWidget(
                "Batch Size Status",
                "custom",
                display,
                {
                    serialize: false,
                    hideOnZoom: false,
                    getMinHeight: () => 34,
                    getMaxHeight: () => 60
                }
            );

            const update = () => {
                if (!this.graph) return;

                const status = findBatchStatus(this);

                display.textContent = status.message;

                if (status.type === "matched") {
                    display.style.background = "#174b30";
                    display.style.color = "#78ff9a";
                } else if (status.type === "mismatch") {
                    display.style.background = "#671c1c";
                    display.style.color = "#ff8585";
                } else {
                    display.style.background = "#303030";
                    display.style.color = "#bbbbbb";
                }
            };

            // Update when users change either batch setting.
            this.krBatchTimer = setInterval(update, 500);
            update();

            return result;
        };

        nodeType.prototype.onRemoved = function () {
            if (this.krBatchTimer) {
                clearInterval(this.krBatchTimer);
            }

            return originalRemoved?.apply(this, arguments);
        };
    }
});
