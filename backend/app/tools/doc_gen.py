import os
import csv
import json
import shutil
import time
from pathlib import Path
from typing import Dict, Any, List, Optional
from app.tools.base import BaseTool
from app.sandbox.process_sandbox import sandbox_manager

class CreateDocumentTool(BaseTool):
    name = "create_document"
    description = "Generates formatted deliverables (md, xlsx, docx, pptx, csv, pdf) and registers them as artifacts."
    risk_level = "medium"

    def get_parameters_schema(self) -> Dict[str, Any]:
        return {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Document title or filename base."},
                "document_type": {
                    "type": "string",
                    "enum": ["md", "xlsx", "docx", "pptx", "csv", "pdf"],
                    "default": "md"
                },
                "content": {"type": "string", "description": "Markdown text or narrative content for document."},
                "data": {
                    "type": "array",
                    "description": "Tabular records for spreadsheet or structured data for presentation.",
                    "items": {"type": "object"}
                }
            },
            "required": ["title", "document_type"]
        }

    async def execute(self, session_id: str, **kwargs) -> Dict[str, Any]:
        title = kwargs.get("title", "deliverable")
        doc_type = kwargs.get("document_type", "md").lower()
        content = kwargs.get("content", "")
        data = kwargs.get("data", [])
        
        sandbox = sandbox_manager.get_or_create(session_id)
        safe_title = "".join(c for c in title if c.isalnum() or c in ("-", "_", " ")).strip().replace(" ", "_")
        filename = f"{safe_title}.{doc_type}"
        file_path = sandbox.artifacts_dir / filename
        previous_snapshot = None
        version = 1
        if file_path.exists():
            version = len(list(sandbox.versions_dir.glob(f"artifact_{filename}.*.bak"))) + 2
            previous_snapshot = sandbox.versions_dir / f"artifact_{filename}.{int(time.time() * 1000)}.bak"
            shutil.copy2(file_path, previous_snapshot)
        
        try:
            if doc_type == "md":
                file_path.write_text(content or f"# {title}\n\nGenerated deliverable.", encoding="utf-8")
                
            elif doc_type == "csv":
                with open(file_path, "w", newline="", encoding="utf-8") as f:
                    if data and isinstance(data, list):
                        headers = list(data[0].keys())
                        writer = csv.DictWriter(f, fieldnames=headers)
                        writer.writeheader()
                        writer.writerows(data)
                    else:
                        writer = csv.writer(f)
                        writer.writerow(["Title", "Content"])
                        writer.writerow([title, content])

            elif doc_type == "xlsx":
                import openpyxl
                from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
                
                wb = openpyxl.Workbook()
                ws = wb.active
                ws.title = "Summary"
                
                # Header styling
                header_font = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
                header_fill = PatternFill(start_color="1F497D", end_color="1F497D", fill_type="solid")
                
                if data and isinstance(data, list):
                    headers = list(data[0].keys())
                    ws.append(headers)
                    for col_idx, h in enumerate(headers, 1):
                        cell = ws.cell(row=1, column=col_idx)
                        cell.font = header_font
                        cell.fill = header_fill
                    
                    for row_idx, row_item in enumerate(data, 2):
                        ws.append([row_item.get(h, "") for h in headers])
                else:
                    ws.append(["Section", "Description", "Value"])
                    for col_idx in range(1, 4):
                        cell = ws.cell(row=1, column=col_idx)
                        cell.font = header_font
                        cell.fill = header_fill
                    ws.append(["Overview", title, "Completed"])
                    ws.append(["Details", content[:100], "Generated"])
                    ws.append(["Status", "Ready for review", "OK"])
                
                # Auto-adjust column widths
                for col in ws.columns:
                    max_len = max(len(str(cell.value or '')) for cell in col)
                    col_letter = openpyxl.utils.get_column_letter(col[0].column)
                    ws.column_dimensions[col_letter].width = max(max_len + 4, 12)
                    
                wb.save(file_path)

            elif doc_type == "docx":
                import docx
                from docx.shared import Inches, Pt, RGBColor
                
                doc = docx.Document()
                doc.add_heading(title, level=0)
                
                # Subheading
                doc.add_heading("Executive Summary", level=1)
                p = doc.add_paragraph(content or "This document was prepared autonomously by Coagent.")
                
                if data and isinstance(data, list):
                    doc.add_heading("Structured Data Summary", level=2)
                    headers = list(data[0].keys())
                    table = doc.add_table(rows=1, cols=len(headers))
                    table.style = "Table Grid"
                    hdr_cells = table.rows[0].cells
                    for i, h in enumerate(headers):
                        hdr_cells[i].text = str(h)
                    for item in data[:20]:
                        row_cells = table.add_row().cells
                        for i, h in enumerate(headers):
                            row_cells[i].text = str(item.get(h, ""))
                            
                doc.save(file_path)

            elif doc_type == "pptx":
                from pptx import Presentation
                from pptx.util import Inches, Pt
                
                prs = Presentation()
                
                # Title slide
                title_slide_layout = prs.slide_layouts[0]
                slide = prs.slides.add_slide(title_slide_layout)
                slide.shapes.title.text = title
                slide.placeholders[1].text = "Autonomous Deliverable · Coagent"
                
                # Content slide
                bullet_slide_layout = prs.slide_layouts[1]
                slide2 = prs.slides.add_slide(bullet_slide_layout)
                slide2.shapes.title.text = "Key Findings & Analysis"
                body_shape = slide2.shapes.placeholders[1]
                tf = body_shape.text_frame
                tf.text = content[:150] if content else "Key points analyzed and structured."
                
                prs.save(file_path)

            elif doc_type == "pdf":
                from reportlab.lib.pagesizes import letter
                from reportlab.pdfgen import canvas
                
                c = canvas.Canvas(str(file_path), pagesize=letter)
                c.setFont("Helvetica-Bold", 16)
                c.drawString(72, 750, title)
                c.setFont("Helvetica", 10)
                c.drawString(72, 730, "Generated by Coagent autonomous workflow")
                
                y = 690
                c.setFont("Helvetica", 11)
                lines = (content or "Deliverable summary report.").split("\n")
                for line in lines:
                    if y < 72:
                        c.showPage()
                        y = 750
                    c.drawString(72, y, line[:90])
                    y -= 18
                c.save()

            file_size = file_path.stat().st_size
            try:
                sandbox.ensure_disk_capacity(0)
            except OSError as exc:
                file_path.unlink(missing_ok=True)
                if previous_snapshot:
                    shutil.copy2(previous_snapshot, file_path)
                    previous_snapshot.unlink(missing_ok=True)
                return {"success": False, "error": str(exc)}
            rel_artifact_path = f"artifacts/{filename}"
            return {
                "success": True,
                "filename": filename,
                "file_type": doc_type,
                "relative_path": rel_artifact_path,
                "file_size_bytes": file_size,
                "version": version,
                "previous_snapshot": previous_snapshot.name if previous_snapshot else None,
                "summary": f"Polished {doc_type.upper()} deliverable: '{filename}' ({file_size} bytes)."
            }

        except Exception as e:
            return {"success": False, "error": f"Failed to generate {doc_type}: {str(e)}"}
