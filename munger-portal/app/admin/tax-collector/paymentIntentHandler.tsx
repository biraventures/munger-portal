import { useRef, useState } from "react";

const IntentHandler = () => {
    const intentFieldRef = useRef<HTMLInputElement>(null);

    const [intentResult, setIntentResult] = useState<string>("Waiting for intent data...");

    const handleIntentClick = (): void => {
        const intentData = intentFieldRef.current?.value;

        if (!intentData) {
            setIntentResult("No intent data received.");
            return;
        }

        try {
            // Parse JSON if applicable
            const parsedData = JSON.parse(intentData);

            setIntentResult(JSON.stringify(parsedData, null, 2));
        } catch {
            // Display raw text if it is not valid JSON
            setIntentResult(intentData);
        }
    };

    return (
        <div>
            {/* Hidden Intent Field */}
            <input
                type="text"
                id="intent_field"
                ref={intentFieldRef}
                style={{ display: "none" }}
            />

            {/* Hidden Intent Button */}
            <button
                type="button"
                id="intent_button"
                style={{ display: "none" }}
                onClick={handleIntentClick}
            >
                Capture Intent
            </button>

            {/* Visible Debug Output */}
            <div
                style={{
                    margin: "20px",
                    padding: "16px",
                    border: "1px solid #ccc",
                    borderRadius: "8px",
                    background: "#f5f5f5",
                    color: "#222",
                    overflowX: "auto",
                }}
            >
                <h3>Intent Debugger</h3>

                <pre
                    style={{
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        fontSize: "14px",
                    }}
                >
                    {intentResult}
                </pre>
            </div>
        </div>
    );
};

export default IntentHandler;