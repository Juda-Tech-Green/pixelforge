import React from "react";
import { createRoot } from "react-dom/client";
import { Editor } from "./editor/Editor.js";
import "./style.css";
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Editor />
  </React.StrictMode>,
);
