import React from "react";
import { createRoot } from "react-dom/client";
import CollectionApp from "../../app/collection-app";
import "../../app/globals.css";

createRoot(document.getElementById("root")!).render(<CollectionApp />);
