import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../src/App";

describe("Egyptian Center facade app", () => {
  it("renders the official RTL workspace labels and controls", () => {
    render(<App />);

    expect(
      screen.getByText("المركز المصري للذكاء الاصطناعي في العمارة والعمران"),
    ).toBeInTheDocument();
    expect(screen.getByText("المدخلات: الواجهة الحالية"))
      .toBeInTheDocument();
    expect(
      screen.getByText(
        "المخرجات: الترميم المعماري المعتمد على الذكاء الاصطناعي (8K)",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /بدء الترميم/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /رفع الصورة/i }))
      .toBeInTheDocument();
    expect(screen.getByPlaceholderText(/اكتب وصف التصميم/i))
      .toBeInTheDocument();
  });

  it("starts with an empty output state and no selected image", () => {
    render(<App />);

    expect(screen.getByText(/ستظهر الواجهة المعمارية هنا/i))
      .toBeInTheDocument();
    expect(screen.getByText(/لم يتم رفع صورة بعد/i)).toBeInTheDocument();
  });
});
