import os
import io
import json

from flask import Blueprint, abort, current_app, jsonify, redirect, render_template, request, send_file, url_for

from database.models import MedicalReport, Patient, db
from routes.auth_routes import get_current_user, log_audit, login_required, require_role

report_bp = Blueprint("report", __name__)


@report_bp.route("/reports", methods=["GET"])
@login_required
def list_reports():
	reports = MedicalReport.query.filter_by(owner_id=get_current_user().id).order_by(MedicalReport.created_at.desc()).all()
	return render_template("reports.html", reports=reports)


@report_bp.route("/api/reports", methods=["GET"])
@login_required
def api_list_reports():
	reports = MedicalReport.query.filter_by(owner_id=get_current_user().id).order_by(MedicalReport.created_at.desc()).all()
	return jsonify([report.to_dict() for report in reports])


@report_bp.route("/api/reports/search", methods=["GET"])
@login_required
def search_reports():
	user = get_current_user()
	query = request.args.get("q", "").strip().lower()
	condition = request.args.get("condition", "").strip().lower()
	reports = MedicalReport.query.filter_by(owner_id=user.id).order_by(MedicalReport.created_at.desc()).all()
	results = []
	for report in reports:
		search_text = " ".join([
			report.title or "",
			report.filename or "",
			report.extracted_text or "",
			report.patient.full_name if report.patient else "",
		]).lower()
		conditions = " ".join((entity.entity_text or "") for entity in report.entities).lower()
		if query and query not in search_text and query not in conditions:
			continue
		if condition and condition not in conditions:
			continue
		results.append(report.to_dict())
	return jsonify(results)


@report_bp.route("/api/dashboard/stats", methods=["GET"])
@login_required
def dashboard_stats():
	from datetime import datetime, timezone
	from sqlalchemy import func
	user = get_current_user()
	month_start = datetime.now(timezone.utc).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
	reports = MedicalReport.query.filter_by(owner_id=user.id).all()
	condition_counts = {}
	for report in reports:
		for entity in report.entities:
			condition_counts[entity.entity_text] = condition_counts.get(entity.entity_text, 0) + 1
	return jsonify({
		"patient_count": Patient.query.filter_by(owner_id=user.id).count(),
		"report_count": len(reports),
		"reports_this_month": sum(1 for report in reports if report.created_at and report.created_at >= month_start),
		"most_common_conditions": sorted(condition_counts.items(), key=lambda item: item[1], reverse=True)[:5],
	})


@report_bp.route("/api/patients/<int:patient_id>/timeline", methods=["GET"])
@login_required
def patient_timeline(patient_id):
	patient = Patient.query.filter_by(id=patient_id, owner_id=get_current_user().id).first_or_404()
	return jsonify([
		{
			"id": report.id,
			"title": report.title or report.filename or "Medical report",
			"created_at": report.created_at.isoformat() if report.created_at else None,
			"entities": [entity.to_dict() for entity in report.entities],
			"lab_results": json.loads(report.lab_results) if report.lab_results else [],
		}
		for report in sorted(patient.reports, key=lambda item: item.created_at or 0, reverse=True)
	])


@report_bp.route("/api/reports/<int:report_id>", methods=["PATCH", "DELETE"])
@login_required
def manage_report(report_id):
	report = MedicalReport.query.filter_by(id=report_id, owner_id=get_current_user().id).first_or_404()
	if request.method == "DELETE":
		if report.file_path and os.path.exists(report.file_path):
			os.remove(report.file_path)
		db.session.delete(report)
		db.session.commit()
		log_audit("report_delete", "medical_report", report_id)
		return jsonify({"deleted": True})

	payload = request.get_json(silent=True) or {}
	title = str(payload.get("title", "")).strip()
	if not title:
		return jsonify({"error": "Report title is required."}), 400
	report.title = title[:255]
	db.session.commit()
	log_audit("report_rename", "medical_report", report_id)
	return jsonify(report.to_dict())


@report_bp.route("/api/reports/<int:report_id>/export/<string:file_format>", methods=["GET"])
@login_required
def export_report(report_id, file_format):
	report = MedicalReport.query.filter_by(id=report_id, owner_id=get_current_user().id).first_or_404()
	patient = report.patient
	data = {
		"patient": {
			"name": patient.full_name if patient else None,
			"age": patient.age if patient else None,
			"gender": patient.gender if patient else None,
			"blood_group": patient.blood_group if patient else None,
		},
		"title": report.title or report.filename or "Medical report",
		"created_at": report.created_at.isoformat() if report.created_at else None,
		"original_text": report.extracted_text,
		"simplified_summary": report.simplified_text,
		"entities": [
			{"text": entity.entity_text, "label": entity.entity_label, "explanation": entity.explanation}
			for entity in report.entities
		],
		"recommendations": [recommendation.to_dict() for recommendation in report.recommendations],
		"questions_to_ask_doctor": [
			"What does this result mean for me?",
			"Should this test be repeated or followed up?",
			"Are there lifestyle changes I should discuss with you?",
		],
		"disclaimer": "This information is for educational purposes only and does not replace professional medical advice.",
	}
	if file_format == "json":
		return jsonify(data)
	if file_format == "txt":
		content = "\n".join([
			data["title"],
			f"Patient: {data['patient']['name'] or 'Unassigned'}",
			f"Date: {data['created_at'] or 'Unavailable'}",
			"",
			"Simplified summary:",
			data["simplified_summary"] or "No summary available.",
			"",
			"Medical terms:",
			*[f"- {item['text']} ({item['label']}): {item['explanation']}" for item in data["entities"]],
			"",
			data["disclaimer"],
		])
		return send_file(io.BytesIO(content.encode("utf-8")), as_attachment=True, download_name="medical-report.txt", mimetype="text/plain")
	if file_format in {"pdf", "docx"}:
		content_lines = [
			data["title"],
			f"Patient: {data['patient']['name'] or 'Unassigned'}",
			f"Date: {data['created_at'] or 'Unavailable'}",
			"",
			"Simplified summary:",
			data["simplified_summary"] or "No summary available.",
			"",
			data["disclaimer"],
		]
		if file_format == "pdf":
			from reportlab.lib.pagesizes import letter
			from reportlab.pdfgen import canvas
			output = io.BytesIO()
			pdf = canvas.Canvas(output, pagesize=letter)
			text = pdf.beginText(48, 750)
			for line in "\n".join(content_lines).splitlines():
				text.textLine(line[:110])
			pdf.drawText(text)
			pdf.save()
			output.seek(0)
			return send_file(output, as_attachment=True, download_name="medical-report.pdf", mimetype="application/pdf")
		from docx import Document
		document = Document()
		for line in content_lines:
			document.add_paragraph(line)
		output = io.BytesIO()
		document.save(output)
		output.seek(0)
		return send_file(output, as_attachment=True, download_name="medical-report.docx", mimetype="application/vnd.openxmlformats-officedocument.wordprocessingml.document")
	return jsonify({"error": "Supported export formats are pdf, docx, json, and txt."}), 400


@report_bp.route("/reports/<int:report_id>/download", methods=["GET"])
@login_required
def download_report(report_id):
	report = MedicalReport.query.filter_by(id=report_id, owner_id=get_current_user().id).first_or_404()
	if report.file_path and os.path.exists(report.file_path):
		return send_file(report.file_path, as_attachment=True, download_name=report.filename)
	return abort(404)


@report_bp.route("/reports/<int:report_id>/delete", methods=["POST"])
@login_required
def delete_report(report_id):
	report = MedicalReport.query.filter_by(id=report_id, owner_id=get_current_user().id).first_or_404()
	db.session.delete(report)
	db.session.commit()
	log_audit("report_delete", "medical_report", report_id)
	return redirect(url_for("report.list_reports"))


@report_bp.route("/api/admin/audit-logs", methods=["GET"])
@login_required
@require_role("admin")
def audit_logs():
	from database.models import AuditLog
	logs = AuditLog.query.order_by(AuditLog.created_at.desc()).limit(200).all()
	return jsonify([
		{
			"action": log.action,
			"resource_type": log.resource_type,
			"resource_id": log.resource_id,
			"user_id": log.user_id,
			"created_at": log.created_at.isoformat() if log.created_at else None,
		}
		for log in logs
	])


@report_bp.route("/api/admin/backup", methods=["GET"])
@login_required
@require_role("admin")
def backup_database():
	db_path = os.path.join(current_app.config["BASE_DIR"], "database", "medreport.db")
	if not os.path.exists(db_path):
		return jsonify({"error": "Database backup is unavailable."}), 404
	return send_file(db_path, as_attachment=True, download_name="medreport-backup.db", mimetype="application/octet-stream")


@report_bp.route("/api/admin/restore", methods=["POST"])
@login_required
@require_role("admin")
def restore_database():
	backup = request.files.get("backup")
	if not backup or not backup.filename.lower().endswith(".db"):
		return jsonify({"error": "Upload a valid SQLite .db backup."}), 400
	db_path = os.path.join(current_app.config["BASE_DIR"], "database", "medreport.db")
	backup.save(db_path)
	return jsonify({"restored": True})