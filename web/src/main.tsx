import React from "react";
import { createRoot } from "react-dom/client";
import ReviewApp from "../../app/review-app";
import "../../app/globals.css";

createRoot(document.getElementById("root")!).render(<ReviewApp />);
