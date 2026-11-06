import { createRoot } from "react-dom/client";
import { AudioEditor } from "./AudioEditor.js";
import "../style.css";
import "./audio.css";
createRoot(document.getElementById("root")!).render(<AudioEditor />);
