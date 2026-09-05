import os

from flask import Blueprint, abort, redirect, render_template, send_file, url_for

from database.models import MedicalReport, db
from routes.auth_routes import login_required

report_bp = Blueprint("report", __name__)


@report_bp.route("/reports", methods=["GET"])
@login_required
def list_reports():
	reports = MedicalReport.query.order_by(MedicalReport.created_at.desc()).all()
	return render_template("reports.html", reports=reports)


@report_bp.route("/reports/<int:report_id>/download", methods=["GET"])
@login_required
def download_report(report_id):
	report = db.get_or_404(MedicalReport, report_id)
	if report.file_path and os.path.exists(report.file_path):
		return send_file(report.file_path, as_attachment=True, download_name=report.filename)
	return abort(404)


@report_bp.route("/reports/<int:report_id>/delete", methods=["POST"])
@login_required
def delete_report(report_id):
	report = db.get_or_404(MedicalReport, report_id)
	db.session.delete(report)
	db.session.commit()
	return redirect(url_for("report.list_reports"))