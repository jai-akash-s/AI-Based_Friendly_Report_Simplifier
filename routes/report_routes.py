import os

from flask import Blueprint, abort, jsonify, redirect, render_template, request, send_file, url_for

from database.models import MedicalReport, db
from routes.auth_routes import get_current_user, login_required

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
	return redirect(url_for("report.list_reports"))