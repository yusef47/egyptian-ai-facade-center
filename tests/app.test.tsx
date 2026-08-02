import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  buildSyndicateReportHtml,
  downloadSyndicateReport,
} from "../src/lib/report";
import { App } from "../src/App";

vi.mock("../src/lib/image", () => ({
  compressImage: vi.fn(async () => "data:image/jpeg;base64,input"),
}));

describe("Syndicate report generation", () => {
  it("builds an escaped self-contained report", () => {
    const html = buildSyndicateReportHtml({
      prompt: "واجهة <خديوية> & إضاءة",
      status: "اكتمل الترميم",
      createdAt: "2026-08-02T12:00:00.000Z",
      inputImageDataUrl: "data:image/jpeg;base64,input",
      outputImageDataUrl: "data:image/png;base64,output",
    });

    expect(html).toContain("تقرير نقابة المهندسين المصرية");
    expect(html).toContain("واجهة &lt;خديوية&gt; &amp; إضاءة");
    expect(html).toContain("اكتمل الترميم");
    expect(html).toContain("data:image/jpeg;base64,input");
    expect(html).toContain("data:image/png;base64,output");
    expect(html).not.toContain("<خديوية>");
  });

  it("omits unsafe image sources from the generated report", () => {
    const html = buildSyndicateReportHtml({
      prompt: "واجهة خديوية",
      status: "جاهز",
      createdAt: "2026-08-02T12:00:00.000Z",
      inputImageDataUrl: "javascript:alert(1)",
      outputImageDataUrl: null,
    });

    expect(html).not.toContain("javascript:alert(1)");
    expect(html).toContain("الواجهة الأصلية غير متاح");
  });

  it("downloads an HTML report with the official filename", () => {
    const originalCreateObjectURL = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
    const originalRevokeObjectURL = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
    const createObjectURL = vi.fn(() => "blob:report");
    const revokeObjectURL = vi.fn();
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURL,
    });
    const anchor = document.createElement("a");
    const createElement = vi.spyOn(document, "createElement").mockReturnValue(anchor);
    const click = vi.spyOn(anchor, "click").mockImplementation(() => undefined);

    try {
      downloadSyndicateReport({
        prompt: "واجهة خديوية",
        status: "جاهز",
        createdAt: "2026-08-02T12:00:00.000Z",
        inputImageDataUrl: null,
        outputImageDataUrl: null,
      });

      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(createElement).toHaveBeenCalledWith("a");
      expect(anchor.download).toBe("egyptian-facade-syndicate-report.html");
      expect(anchor.href).toContain("blob:report");
      expect(click).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    } finally {
      click.mockRestore();
      createElement.mockRestore();
      if (originalCreateObjectURL) {
        Object.defineProperty(URL, "createObjectURL", originalCreateObjectURL);
      } else {
        Reflect.deleteProperty(URL, "createObjectURL");
      }
      if (originalRevokeObjectURL) {
        Object.defineProperty(URL, "revokeObjectURL", originalRevokeObjectURL);
      } else {
        Reflect.deleteProperty(URL, "revokeObjectURL");
      }
    }
  });
});

describe("V113 Egyptian Center facade studio", () => {
  it("renders official branding, navigation, hero, metrics, studio, and report", () => {
    render(<App />);

    expect(screen.getByText("نقابة المهندسين المصرية")).toBeInTheDocument();
    expect(screen.getByText("المركز المصري للذكاء الاصطناعي في العمارة والعمران"))
      .toBeInTheDocument();
    expect(screen.getByRole("link", { name: "الرئيسية" })).toHaveAttribute("href", "#home");
    expect(screen.getByRole("link", { name: "الإحصائيات القومية" })).toHaveAttribute("href", "#metrics");
    expect(screen.getByRole("link", { name: "استوديو الترميم" })).toHaveAttribute("href", "#studio");
    expect(screen.getByRole("link", { name: "تصدير تقرير النقابة" })).toHaveAttribute("href", "#report");
    expect(screen.getByText("الذكاء الاصطناعي في خدمة العمارة والعمران المصري"))
      .toBeInTheDocument();
    expect(screen.getByText("منصة سيادية لتوليد وترميم واجهات المباني المصرية بدقة 8K"))
      .toBeInTheDocument();
    expect(screen.getByText("15,400+")).toBeInTheDocument();
    expect(screen.getByText("88.8%")).toBeInTheDocument();
    expect(screen.getByText("0.82M م²")).toBeInTheDocument();
    expect(screen.getByText("3.12s")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إرسال 🚀" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /تصدير تقرير النقابة/i })).toBeInTheDocument();
  });

  it("posts imageDataUrl and prompt, then renders imageDataUrl output", async () => {
    const output = "data:image/png;base64,result";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ imageDataUrl: output }),
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    const file = new File(["facade"], "facade.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByTestId("facade-file-input"), { target: { files: [file] } });
    fireEvent.change(screen.getByLabelText("الوصف المعماري"), {
      target: { value: "واجهة خديوية بحجر هشمي وإضاءة ذهبية" },
    });
    await waitFor(() => expect(screen.getByAltText("الواجهة الأصلية")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "إرسال 🚀" }));

    await waitFor(() => expect(screen.getByAltText("الواجهة بعد الترميم")).toHaveAttribute("src", output));
    expect(fetchMock).toHaveBeenCalledWith("/api/restore", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        imageDataUrl: "data:image/jpeg;base64,input",
        prompt: "واجهة خديوية بحجر هشمي وإضاءة ذهبية",
      }),
    }));
    vi.unstubAllGlobals();
  });

  it("shows validation feedback before a restore request", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: "إرسال 🚀" }));
    expect(screen.getByRole("status")).toHaveTextContent(/ارفع صورة الواجهة أولاً/i);
  });
});
