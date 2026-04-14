import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doctorAPI, labTestAPI, medicineAPI, questionLibraryAPI } from '../../utils/api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import './DoctorPatientDetails.css';
import DynamicQuestionForm from '../../components/DynamicQuestionForm';

const DoctorPatientDetails = () => {
    const { appointmentId } = useParams();
    const navigate = useNavigate();
    const [appointment, setAppointment] = useState(null);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [catalogTests, setCatalogTests] = useState([]);
    const [catalogMedicines, setCatalogMedicines] = useState([]);
    const [dynamicLibrary, setDynamicLibrary] = useState(null);

    // Modal States
    const [showPrescribeModal, setShowPrescribeModal] = useState(false);

    // Tab State for Left Panel
    const [activeTab, setActiveTab] = useState('overview');

    // Time Machine Feature State
    const [viewingPastSession, setViewingPastSession] = useState(null);

    // Doctor's Session Notepad (Right Panel)
    const [sessionData, setSessionData] = useState({
        diagnosis: '', notes: '', prescription: '', labTests: ''
    });

    // Patient Intake Profile (Left Panel - Editable by Doctor)
    const [intakeData, setIntakeData] = useState({});

    // Tab Scrolling Reference
    const tabsRef = useRef(null);

    const handleTabsWheel = (e) => {
        if (tabsRef.current) {
            // Only convert pure vertical scrolling to horizontal scrolling (mouse wheels)
            // Allow native 2-finger horizontal trackpad scrolling to pass through naturally
            if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                e.preventDefault();
                tabsRef.current.scrollBy({ left: e.deltaY, behavior: 'auto' });
            }
        }
    };

    const scrollTabs = (dir) => {
        if (tabsRef.current) {
            tabsRef.current.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
        }
    };

    // Add non-passive event listener for proper wheel interception without console errors
    useEffect(() => {
        const el = tabsRef.current;
        if (el) {
            el.addEventListener('wheel', handleTabsWheel, { passive: false });
        }
        return () => {
            if (el) el.removeEventListener('wheel', handleTabsWheel);
        };
    }, []);

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                const res = await doctorAPI.getAppointmentDetails(appointmentId);
                if (res.success) {
                    setAppointment(res.appointment);
                    setIntakeData(res.appointment.userId?.fertilityProfile || {});

                    if (res.appointment.userId?._id) {
                        const histRes = await doctorAPI.getPatientHistory(res.appointment.userId._id);
                        if (histRes.success) setHistory(histRes.history || []);
                    }

                    setSessionData({
                        diagnosis: res.appointment.diagnosis || '',
                        notes: res.appointment.doctorNotes || '',
                        prescription: '',
                        labTests: (res.appointment.labTests || []).join(', ')
                    });
                }
            } catch (err) { console.error(err); }

            try {
                const testRes = await labTestAPI.getLabTests();
                if (testRes.success) {
                    setCatalogTests(testRes.data || []);
                }
            } catch (err) { console.error("Error fetching lab test catalog", err); }

            try {
                const medRes = await medicineAPI.getMedicines();
                if (medRes.success) {
                    setCatalogMedicines(medRes.data || []);
                }
            } catch (err) { console.error("Error fetching medicine catalog", err); }

            try {
                const libRes = await questionLibraryAPI.getLibrary();
                if (libRes.success && libRes.data && libRes.data.data) {
                    setDynamicLibrary(libRes.data.data);
                }
            } catch (err) { console.error("Error fetching dynamic question library", err); }

            finally { setLoading(false); }
        };
        fetchDetails();
    }, [appointmentId]);

    const handleIntakeChange = (e) => {
        const { name, value } = e.target;
        // Handle BMI calculation
        if (name === 'height' || name === 'weight') {
            const h = name === 'height' ? value : intakeData.height;
            const w = name === 'weight' ? value : intakeData.weight;
            if (h && w) {
                const hM = parseFloat(h) / 100;
                const bmi = (parseFloat(w) / (hM * hM)).toFixed(2);
                setIntakeData(prev => ({ ...prev, [name]: value, bmi }));
                return;
            }
        }
        setIntakeData(prev => ({ ...prev, [name]: value }));
    };

    const handleSessionChange = (e) => {
        setSessionData(prev => ({ ...prev, [e.target.name]: e.target.value }));
    };

    const handleSaveProfile = async () => {
        if (!appointment?.userId?._id) return;
        setSaving(true);
        try {
            await doctorAPI.updatePatientProfile(appointment.userId._id, intakeData);
            alert("✅ Patient profile saved successfully!");
        } catch (err) {
            alert("Error saving profile: " + err.message);
        } finally { setSaving(false); }
    };

    const handleSaveAndMerge = async () => {
        if (!window.confirm("Save all changes and finish session?")) return;
        setSaving(true);
        try {
            // 1. Save Profile
            if (appointment.userId?._id) {
                await doctorAPI.updatePatientProfile(appointment.userId._id, intakeData);
            }

            // 2. Save Session
            const payload = {
                status: 'completed',
                diagnosis: sessionData.diagnosis,
                notes: sessionData.notes,
                labTests: sessionData.labTests.split(',').map(s => s.trim()).filter(Boolean),
                pharmacy: sessionData.prescription.split('\n').filter(Boolean).map(m => ({ medicineName: m.trim() }))
            };
            await doctorAPI.updateSession(appointmentId, payload);

            // 3. Generate PDF
            generateCumulativePDF(intakeData, history, payload);

            alert("✅ Session completed & report generated!");
            navigate('/doctor/patients');
        } catch (err) {
            alert("Error: " + err.message);
        } finally { setSaving(false); }
    };

    const generateCumulativePDF = (intake, pastHistory, currentData) => {
        const doc = new jsPDF();
        let y = 20;

        doc.setFontSize(22);
        doc.setTextColor(41, 128, 185);
        doc.text("PAWAN HARISH IVF CENTER", 105, y, { align: 'center' });
        y += 10;
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text("Excellence in Fertility Care", 105, y, { align: 'center' });
        y += 15;

        doc.setLineWidth(0.5);
        doc.setDrawColor(200);
        doc.line(10, y, 200, y);
        y += 10;

        doc.setFontSize(18);
        doc.setTextColor(0);
        doc.text("CLINICAL RECORD / PRESCRIPTION", 105, y, { align: 'center' }); y += 15;

        doc.setFillColor(240, 240, 240); doc.rect(14, y, 182, 35, 'F');
        doc.setFontSize(11);

        const cardX = 20;
        let cardY = y + 8;

        doc.setFont("helvetica", "bold");
        doc.text(`Patient Name:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${intake.firstName || appointment.userId?.name || ''} ${intake.lastName || ''}`, cardX + 30, cardY);

        doc.setFont("helvetica", "bold");
        doc.text(`MRN / ID:`, cardX + 100, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${appointment.userId?.patientId || 'N/A'}`, cardX + 130, cardY);

        cardY += 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Age / Gender:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${intake.age || '-'} / ${intake.gender || '-'}`, cardX + 30, cardY);

        doc.setFont("helvetica", "bold");
        doc.text(`Date:`, cardX + 100, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${new Date().toLocaleDateString()}`, cardX + 130, cardY);

        cardY += 8;
        doc.setFont("helvetica", "bold");
        doc.text(`Contact:`, cardX, cardY);
        doc.setFont("helvetica", "normal");
        doc.text(`${appointment.userId?.phone || '-'}`, cardX + 30, cardY);

        y += 45;

        const profileData = [
            ["Chief Complaint", intake.chiefComplaint || '-'],
            ["Medical History", intake.medicalHistory || '-'],
            ["Height / Weight / BMI", `${intake.height || '-'} cm / ${intake.weight || '-'} kg / ${intake.bmi || '-'}`],
            ["Blood Group", intake.bloodGroup || '-'],
            ["Obstetric Hx", `G${intake.gravida || '-'} P${intake.para || '-'} A${intake.abortion || '-'} L${intake.living || '-'} E${intake.ectopic || '-'}`]
        ];
        autoTable(doc, {
            startY: y,
            head: [['Clinical Summary', 'Details']],
            body: profileData,
            theme: 'grid',
            headStyles: { fillColor: [41, 128, 185], textColor: 255 },
            columnStyles: { 0: { fontStyle: 'bold', width: 50 } }
        });
        y = doc.lastAutoTable.finalY + 10;

        if (pastHistory.length > 0) {
            doc.setFillColor(220, 240, 255); doc.rect(14, y, 180, 8, 'F');
            doc.text("PAST SESSIONS", 16, y + 6); y += 12;
            const rows = pastHistory.filter(h => h.status === 'completed' && h._id !== appointmentId).map(h => [
                new Date(h.appointmentDate).toLocaleDateString(), h.diagnosis || '-', h.doctorNotes || '-'
            ]);
            if (rows.length > 0) {
                autoTable(doc, { startY: y, head: [['Date', 'Diagnosis', 'Notes']], body: rows });
                y = doc.lastAutoTable.finalY + 10;
            }
        }

        if (y > 250) { doc.addPage(); y = 20; }
        doc.setFillColor(200, 255, 200); doc.rect(14, y, 180, 8, 'F');
        doc.text(`CURRENT SESSION: ${new Date().toLocaleDateString()}`, 16, y + 6); y += 12;

        doc.setFontSize(10);
        doc.text(`Diagnosis: ${currentData.diagnosis}`, 16, y); y += 10;
        doc.text("Notes:", 16, y); y += 6;
        const notes = doc.splitTextToSize(currentData.notes, 170);
        doc.text(notes, 16, y); y += (notes.length * 5) + 10;

        doc.text("Prescription:", 16, y); y += 6;
        const rx = (currentData.pharmacy || []).map(p => p.medicineName).join('\n');
        doc.text(rx || '-', 16, y);

        doc.save("Patient_Record.pdf");
    };

    if (loading) {
        return (
            <div className="dpd-loading">
                <div className="dpd-spinner"></div>
                <p>Loading patient data...</p>
            </div>
        );
    }

    if (!appointment) {
        return (
            <div className="dpd-loading">
                <p>❌ Appointment not found.</p>
                <button onClick={() => navigate('/doctor/patients')} className="dpd-back-btn">← Back to Dashboard</button>
            </div>
        );
    }

    const patient = appointment.userId || {};
    const profile = patient.fertilityProfile || intakeData;

    const tabs = [
        { id: 'overview', label: 'Overview', icon: '📋' },
        { id: 'vitals', label: 'Vitals', icon: '💓' },
        { id: 'clinical', label: 'Clinical', icon: '🏥' },
        { id: 'obstetric', label: 'Obstetric', icon: '🤰' },
        { id: 'spouse', label: 'Spouse/Partner', icon: '👫' },
        { id: 'menstrual', label: 'Menstrual', icon: '📅' },
        { id: 'treatment', label: 'Treatment Hx', icon: '💊' },
        { id: 'history', label: 'Past Visits', icon: '📜' },
    ];

    // Dynamic Form Tabs Injection
    const genderKey = profile.gender || intakeData.gender || 'Female';
    let dynamicTabs = [];
    if (dynamicLibrary) {
        // Load gender specific
        if (dynamicLibrary[genderKey]) {
            Object.keys(dynamicLibrary[genderKey]).forEach((catKey, i) => {
                dynamicTabs.push({ id: `dyn_${genderKey}_${i}`, label: catKey, icon: '📋', data: dynamicLibrary[genderKey][catKey] });
            });
        }
        // Load general
        if (dynamicLibrary['General']) {
            Object.keys(dynamicLibrary['General']).forEach((catKey, i) => {
                dynamicTabs.push({ id: `dyn_Gen_${i}`, label: catKey, icon: '📋', data: dynamicLibrary['General'][catKey] });
            });
        }
    }

    const allTabs = [...tabs, ...dynamicTabs];

    return (
        <div className="dpd-container">
            {/* LEFT PANEL */}
            <div className="dpd-left">
                {/* Patient Header Card */}
                <div className="dpd-patient-header">
                    <button className="dpd-back-link" onClick={() => navigate('/doctor/patients')}>
                        ← Back
                    </button>
                    <div className="dpd-patient-identity">
                        <div className="dpd-patient-avatar">
                            {(patient.name || 'P')[0].toUpperCase()}
                        </div>
                        <div className="dpd-patient-meta">
                            <h2>{patient.name || 'Unknown Patient'}</h2>
                            <div className="dpd-patient-tags">
                                <span className="dpd-tag tag-mrn">MRN: {patient.patientId || 'N/A'}</span>
                                <span className="dpd-tag tag-phone">📱 {patient.phone || '-'}</span>
                                {profile.age && <span className="dpd-tag tag-age">Age: {profile.age}</span>}
                                {profile.gender && <span className="dpd-tag tag-gender">{profile.gender}</span>}
                                {profile.bloodGroup && <span className="dpd-tag tag-blood">🩸 {profile.bloodGroup}</span>}
                            </div>
                        </div>
                    </div>
                    <div className="dpd-appt-info">
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Date</span>
                            <span className="dpd-appt-value">{new Date(appointment.appointmentDate).toLocaleDateString('en-IN')}</span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Time</span>
                            <span className="dpd-appt-value">{appointment.appointmentTime}</span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Status</span>
                            <span className={`dpd-appt-status status-${appointment.status}`}>{appointment.status}</span>
                        </div>
                        <div className="dpd-appt-item">
                            <span className="dpd-appt-label">Service</span>
                            <span className="dpd-appt-value">{appointment.serviceName || 'Consultation'}</span>
                        </div>
                    </div>
                </div>

                {/* Tabs Navigation */}
                <div className="dpd-tabs-container">
                    <button className="dpd-tab-scroll-btn" onClick={() => scrollTabs('left')} title="Scroll Left">‹</button>
                    <div className="dpd-tabs-nav" ref={tabsRef}>
                        {allTabs.map(tab => (
                            <button
                                key={tab.id}
                                className={`dpd-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => setActiveTab(tab.id)}
                            >
                                <span className="dpd-tab-icon">{tab.icon}</span>
                                <span className="dpd-tab-label">{tab.label}</span>
                            </button>
                        ))}
                    </div>
                    <button className="dpd-tab-scroll-btn" onClick={() => scrollTabs('right')} title="Scroll Right">›</button>
                </div>

                {/* Tab Content */}
                <div className="dpd-tab-content">
                    {/* OVERVIEW */}
                    {activeTab === 'overview' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">📋 Patient Overview</h3>
                            <div className="dpd-overview-grid">
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Full Name</span>
                                    <span className="dpd-ov-value">{patient.name || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Phone</span>
                                    <span className="dpd-ov-value">{patient.phone || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Email</span>
                                    <span className="dpd-ov-value">{patient.email || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Age</span>
                                    <span className="dpd-ov-value">{profile.age || intakeData.age || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Gender</span>
                                    <span className="dpd-ov-value">{profile.gender || intakeData.gender || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Blood Group</span>
                                    <span className="dpd-ov-value">{profile.bloodGroup || intakeData.bloodGroup || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Height</span>
                                    <span className="dpd-ov-value">{profile.height || intakeData.height || '-'} cm</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Weight</span>
                                    <span className="dpd-ov-value">{profile.weight || intakeData.weight || '-'} kg</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">BMI</span>
                                    <span className="dpd-ov-value">{profile.bmi || intakeData.bmi || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Address</span>
                                    <span className="dpd-ov-value">{patient.address || profile.address || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Chief Complaint</span>
                                    <span className="dpd-ov-value">{profile.chiefComplaint || intakeData.chiefComplaint || '-'}</span>
                                </div>
                                <div className="dpd-ov-card">
                                    <span className="dpd-ov-label">Reason for Visit</span>
                                    <span className="dpd-ov-value">{profile.reasonForVisit || intakeData.reasonForVisit || '-'}</span>
                                </div>
                            </div>

                            {/* Partner Quick Info */}
                            {(profile.partnerFirstName || intakeData.partnerFirstName) && (
                                <div className="dpd-partner-quick">
                                    <h4>👫 Spouse/Partner Info</h4>
                                    <div className="dpd-overview-grid">
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Name</span>
                                            <span className="dpd-ov-value">{profile.partnerFirstName || intakeData.partnerFirstName || '-'} {profile.partnerLastName || intakeData.partnerLastName || ''}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Phone</span>
                                            <span className="dpd-ov-value">{profile.partnerMobile || intakeData.partnerMobile || '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Age</span>
                                            <span className="dpd-ov-value">{profile.partnerAge || intakeData.partnerAge || profile.husbandAge || intakeData.husbandAge || '-'}</span>
                                        </div>
                                        <div className="dpd-ov-card">
                                            <span className="dpd-ov-label">Partner Blood Group</span>
                                            <span className="dpd-ov-value">{profile.partnerBloodGroup || intakeData.partnerBloodGroup || '-'}</span>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* VITALS */}
                    {activeTab === 'vitals' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">💓 Vitals & Measurements</h3>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Height (cm)</label>
                                    <input name="height" type="number" value={intakeData.height || ''} onChange={handleIntakeChange} placeholder="e.g. 165" />
                                </div>
                                <div className="dpd-field">
                                    <label>Weight (kg)</label>
                                    <input name="weight" type="number" value={intakeData.weight || ''} onChange={handleIntakeChange} placeholder="e.g. 65" />
                                </div>
                                <div className="dpd-field">
                                    <label>BMI (Auto)</label>
                                    <input name="bmi" value={intakeData.bmi || ''} readOnly className="dpd-readonly" />
                                </div>
                                <div className="dpd-field">
                                    <label>Blood Group</label>
                                    <select name="bloodGroup" value={intakeData.bloodGroup || ''} onChange={handleIntakeChange}>
                                        <option value="">-- Select --</option>
                                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                                            <option key={bg} value={bg}>{bg}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="dpd-field">
                                    <label>Blood Pressure</label>
                                    <input name="historyBp" value={intakeData.historyBp || ''} onChange={handleIntakeChange} placeholder="e.g. 120/80 mmHg" />
                                </div>
                                <div className="dpd-field">
                                    <label>Pulse</label>
                                    <input name="historyPulse" value={intakeData.historyPulse || ''} onChange={handleIntakeChange} placeholder="e.g. 72 bpm" />
                                </div>
                                <div className="dpd-field">
                                    <label>Chest Examination</label>
                                    <input name="chestExam" value={intakeData.chestExam || ''} onChange={handleIntakeChange} placeholder="e.g. Clear, BLAE+" />
                                </div>
                                <div className="dpd-field">
                                    <label>CVS Examination</label>
                                    <input name="cvsExam" value={intakeData.cvsExam || ''} onChange={handleIntakeChange} placeholder="e.g. S1S2+, No murmurs" />
                                </div>
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Vitals'}
                            </button>
                        </div>
                    )}

                    {/* CLINICAL HISTORY */}
                    {activeTab === 'clinical' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">🏥 Clinical History</h3>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Wife's Age</label>
                                    <input name="wifeAge" value={intakeData.wifeAge || ''} onChange={handleIntakeChange} placeholder="Wife Age" />
                                </div>
                                <div className="dpd-field">
                                    <label>Husband's Age</label>
                                    <input name="husbandAge" value={intakeData.husbandAge || ''} onChange={handleIntakeChange} placeholder="Husband Age" />
                                </div>
                            </div>
                            <div className="dpd-field-full">
                                <label>Chief Complaint (Duration of Infertility)</label>
                                <textarea name="chiefComplaint" value={intakeData.chiefComplaint || ''} onChange={handleIntakeChange} placeholder="e.g. Primary Infertility for 3 years..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>Medical History (Diabetes, HTN, TB, Thyroid, Asthma, Epilepsy)</label>
                                <textarea name="medicalHistory" value={intakeData.medicalHistory || ''} onChange={handleIntakeChange} placeholder="Check relevant history..." />
                            </div>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Lifestyle (Smoking, Drinking, etc.)</label>
                                    <input name="lifestyle" value={intakeData.lifestyle || ''} onChange={handleIntakeChange} placeholder="e.g. Smoker, Alcohol occasionally..." />
                                </div>
                                <div className="dpd-field">
                                    <label>Known Allergies</label>
                                    <input name="allergies" value={intakeData.allergies || ''} onChange={handleIntakeChange} placeholder="e.g. Penicillin, Pollen..." />
                                </div>
                            </div>

                            <div className="dpd-field-full" style={{ background: '#f8fafc', padding: '16px', borderRadius: '10px', border: '1px solid #e2e8f0' }}>
                                <label style={{ color: '#0f172a', fontSize: '0.9rem', marginBottom: '12px' }}>Surgical History</label>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '10px' }}>
                                    {[
                                        { id: 'surgeryHysteroscopy', label: 'Hysteroscopy' },
                                        { id: 'surgeryLaparoscopy', label: 'Laparoscopy' },
                                        { id: 'surgeryAppendectomy', label: 'Appendectomy' },
                                        { id: 'surgeryOther', label: 'Other Surgery' }
                                    ].map(surg => (
                                        <div key={surg.id} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontWeight: 'bold', color: '#334155', fontSize: '0.85rem' }}>
                                                <input
                                                    type="checkbox"
                                                    name={surg.id}
                                                    checked={intakeData[surg.id] || false}
                                                    onChange={(e) => setIntakeData(prev => ({ ...prev, [surg.id]: e.target.checked }))}
                                                />
                                                {surg.label}
                                            </label>
                                            {intakeData[surg.id] && (
                                                <input
                                                    type="text"
                                                    name={`${surg.id}Details`}
                                                    value={intakeData[`${surg.id}Details`] || ''}
                                                    onChange={handleIntakeChange}
                                                    placeholder={`Findings/Details for ${surg.label}...`}
                                                    style={{ width: 'calc(100% - 24px)', padding: '10px 14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '0.9rem', outline: 'none', marginLeft: '24px', background: 'white' }}
                                                    onFocus={(e) => { e.target.style.borderColor = '#3b82f6'; e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)'; }}
                                                    onBlur={(e) => { e.target.style.borderColor = '#cbd5e1'; e.target.style.boxShadow = 'none'; }}
                                                />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="dpd-field-full">
                                <label>Family History (Premature menopause, Genetic disorders)</label>
                                <textarea name="familyHistory" value={intakeData.familyHistory || ''} onChange={handleIntakeChange} />
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Clinical Data'}
                            </button>
                        </div>
                    )}

                    {/* OBSTETRIC */}
                    {activeTab === 'obstetric' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">🤰 Obstetric History</h3>
                            <div className="dpd-field-full" style={{ background: '#eff6ff', padding: '12px', borderRadius: '8px', fontSize: '0.88rem', color: '#1e40af', border: '1px solid #bfdbfe', marginBottom: '16px' }}>
                                <strong>Note:</strong> All previous pregnancies <strong>above 7 months</strong> will be considered as <strong>Para</strong>, and others will be considered as <strong>Abortion</strong>.
                            </div>
                            <div className="dpd-form-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr)', gap: '10px' }}>
                                <div className="dpd-field">
                                    <label>Gravida (G)</label>
                                    <input name="gravida" type="number" min="0" value={intakeData.gravida || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Para (P)</label>
                                    {intakeData.paraSelect === 'manual' || (intakeData.para && !['1', '2', '3', '4'].includes(String(intakeData.para))) ? (
                                        <div style={{ display: 'flex', gap: '4px' }}>
                                            <input name="para" type="number" value={intakeData.para || ''} onChange={handleIntakeChange} autoFocus style={{ width: '100%', padding: '10px 8px' }} />
                                            <button type="button" onClick={() => setIntakeData(prev => ({ ...prev, paraSelect: '', para: '' }))} style={{ border: 'none', background: '#e2e8f0', borderRadius: '6px', cursor: 'pointer', padding: '0 8px', color: '#475569', fontWeight: 'bold' }}>✕</button>
                                        </div>
                                    ) : (
                                        <select name="paraSelect" value={intakeData.para || ''} onChange={(e) => {
                                            if (e.target.value === 'manual') {
                                                setIntakeData(prev => ({ ...prev, paraSelect: 'manual', para: '' }));
                                            } else {
                                                handleIntakeChange({ target: { name: 'para', value: e.target.value } });
                                                setIntakeData(prev => ({ ...prev, paraSelect: '' }));
                                            }
                                        }}>
                                            <option value="">--</option>
                                            <option value="1">1</option>
                                            <option value="2">2</option>
                                            <option value="3">3</option>
                                            <option value="4">4</option>
                                            <option value="manual">&gt; 4 (Manual Entry)</option>
                                        </select>
                                    )}
                                </div>
                                <div className="dpd-field">
                                    <label>Abortion (A)</label>
                                    <input name="abortion" type="number" min="0" value={intakeData.abortion || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Living (L)</label>
                                    <input name="living" type="number" min="0" value={intakeData.living || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Ectopic (E)</label>
                                    <input name="ectopic" type="number" min="0" value={intakeData.ectopic || ''} onChange={handleIntakeChange} />
                                </div>
                            </div>

                            {Number(intakeData.abortion) > 0 && (
                                <div className="dpd-field-full" style={{ marginTop: '16px', background: '#fff1f2', padding: '16px', borderRadius: '10px', border: '1px solid #fecdd3' }}>
                                    <h4 style={{ margin: '0 0 12px', fontSize: '0.95rem', color: '#be123c' }}>📉 Abortion Details</h4>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                        {Array.from({ length: Number(intakeData.abortion) }).map((_, idx) => (
                                            <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                <label style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#9f1239' }}>
                                                    Why did Abortion #{idx + 1} happen?
                                                </label>
                                                <input
                                                    type="text"
                                                    name={`abortionReason_${idx}`}
                                                    value={intakeData[`abortionReason_${idx}`] || ''}
                                                    onChange={handleIntakeChange}
                                                    placeholder={`Enter comment for Abortion ${idx + 1}...`}
                                                    style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid #fda4af', fontSize: '0.9rem', outline: 'none', background: 'white' }}
                                                    onFocus={(e) => { e.target.style.borderColor = '#fb7185'; e.target.style.boxShadow = '0 0 0 3px rgba(225, 29, 72, 0.1)'; }}
                                                    onBlur={(e) => { e.target.style.borderColor = '#fda4af'; e.target.style.boxShadow = 'none'; }}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <div className="dpd-field-full" style={{ marginTop: '16px' }}>
                                <label>Details of Previous Pregnancies</label>
                                <textarea name="obstetricDetails" value={intakeData.obstetricDetails || ''} onChange={handleIntakeChange} placeholder="1. 2018 - FTND - Male - Healthy..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>History of Ectopic Pregnancy?</label>
                                <input name="ectopicHistory" value={intakeData.ectopicHistory || ''} onChange={handleIntakeChange} placeholder="Details if any..." />
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Obstetric Data'}
                            </button>
                        </div>
                    )}

                    {/* SPOUSE / PARTNER */}
                    {activeTab === 'spouse' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">👫 Spouse / Partner Details</h3>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Partner Title</label>
                                    <select name="partnerTitle" value={intakeData.partnerTitle || ''} onChange={handleIntakeChange}>
                                        <option value="">--</option>
                                        <option value="Mr.">Mr.</option>
                                        <option value="Mrs.">Mrs.</option>
                                        <option value="Dr.">Dr.</option>
                                    </select>
                                </div>
                                <div className="dpd-field">
                                    <label>Partner First Name</label>
                                    <input name="partnerFirstName" value={intakeData.partnerFirstName || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Last Name</label>
                                    <input name="partnerLastName" value={intakeData.partnerLastName || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Age</label>
                                    <input name="partnerAge" type="number" value={intakeData.partnerAge || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner DOB</label>
                                    <input name="partnerDob" type="date" value={intakeData.partnerDob || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Mobile</label>
                                    <input name="partnerMobile" value={intakeData.partnerMobile || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Email</label>
                                    <input name="partnerEmail" value={intakeData.partnerEmail || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Blood Group</label>
                                    <select name="partnerBloodGroup" value={intakeData.partnerBloodGroup || ''} onChange={handleIntakeChange}>
                                        <option value="">-- Select --</option>
                                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => (
                                            <option key={bg} value={bg}>{bg}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <h4 className="dpd-sub-title">📏 Partner Vitals</h4>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Partner Height (cm)</label>
                                    <input name="partnerHeight" type="number" value={intakeData.partnerHeight || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner Weight (kg)</label>
                                    <input name="partnerWeight" type="number" value={intakeData.partnerWeight || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Partner BP</label>
                                    <input name="partnerBp" value={intakeData.partnerBp || ''} onChange={handleIntakeChange} placeholder="e.g. 120/80" />
                                </div>
                            </div>

                            <div className="dpd-field-full">
                                <label>Partner Medical Comments</label>
                                <textarea name="partnerMedicalComments" value={intakeData.partnerMedicalComments || ''} onChange={handleIntakeChange} placeholder="Any medical conditions, allergies, etc." />
                            </div>

                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Partner Details'}
                            </button>
                        </div>
                    )}

                    {/* MENSTRUAL */}
                    {activeTab === 'menstrual' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">📅 Menstrual History</h3>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Age of Menarche</label>
                                    <input name="menarcheAge" value={intakeData.menarcheAge || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>LMP (Last Menstrual Period)</label>
                                    <input type="date" name="lmp" value={intakeData.lmp || intakeData.lmpDate || ''} onChange={handleIntakeChange} />
                                </div>
                                <div className="dpd-field">
                                    <label>Cycle Regularity</label>
                                    <select name="cycleRegularity" value={intakeData.cycleRegularity || intakeData.menstrualRegularity || ''} onChange={handleIntakeChange}>
                                        <option value="">-- Select --</option>
                                        <option value="Regular">Regular (28-30 days)</option>
                                        <option value="Irregular">Irregular</option>
                                        <option value="Oligomenorrhea">Oligomenorrhea (Delayed)</option>
                                        <option value="Polymenorrhea">Polymenorrhea (Frequent)</option>
                                    </select>
                                </div>
                                <div className="dpd-field">
                                    <label>Flow Duration (Days)</label>
                                    <input name="flowDuration" value={intakeData.flowDuration || intakeData.menstrualFlow || ''} onChange={handleIntakeChange} placeholder="e.g. 3-4 days" />
                                </div>
                            </div>
                            <div className="dpd-field-full">
                                <label>Dysmenorrhea (Painful Periods)?</label>
                                <input name="dysmenorrhea" value={intakeData.dysmenorrhea || intakeData.menstrualPain || ''} onChange={handleIntakeChange} placeholder="Mild / Moderate / Severe" />
                            </div>
                            <div className="dpd-form-grid">
                                <div className="dpd-field">
                                    <label>Intermenstrual Pain</label>
                                    <select name="intermenstrualPain" value={intakeData.intermenstrualPain || ''} onChange={handleIntakeChange}>
                                        <option value="">-- Select --</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                                <div className="dpd-field">
                                    <label>Intermenstrual Bleeding</label>
                                    <select name="intermenstrualBleeding" value={intakeData.intermenstrualBleeding || ''} onChange={handleIntakeChange}>
                                        <option value="">-- Select --</option>
                                        <option value="Yes">Yes</option>
                                        <option value="No">No</option>
                                    </select>
                                </div>
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Menstrual Data'}
                            </button>
                        </div>
                    )}

                    {/* TREATMENT HISTORY */}
                    {activeTab === 'treatment' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">💊 Previous Investigations & Treatments</h3>
                            <div className="dpd-field-full">
                                <label>Hysterosalpingography (HSG) Status</label>
                                <input name="hsgStatus" value={intakeData.hsgStatus || ''} onChange={handleIntakeChange} placeholder="Patent / Blocked / Not done" />
                            </div>
                            <div className="dpd-field-full">
                                <label>Previous IUI Cycles</label>
                                <textarea name="prevIUI" value={intakeData.prevIUI || ''} onChange={handleIntakeChange} placeholder="Number of cycles, stimulation details, outcome..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>Previous IVF/ICSI Cycles</label>
                                <textarea name="prevIVF" value={intakeData.prevIVF || ''} onChange={handleIntakeChange} placeholder="Date, No. of oocytes, Embryos, ET outcome..." />
                            </div>
                            <div className="dpd-field-full">
                                <label>Treatment History Summary</label>
                                <textarea name="treatmentHistory" value={intakeData.treatmentHistory || ''} onChange={handleIntakeChange} placeholder="Summary of all previous treatments..." />
                            </div>
                            <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving}>
                                {saving ? 'Saving...' : '💾 Save Treatment Data'}
                            </button>
                        </div>
                    )}

                    {/* PAST VISITS HISTORY */}
                    {activeTab === 'history' && (
                        <div className="dpd-tab-panel">
                            <h3 className="dpd-panel-title">📜 Previous Consultations ({history.length})</h3>
                            {history.length === 0 ? (
                                <div className="dpd-empty-hist">
                                    <p>No previous visits recorded.</p>
                                </div>
                            ) : (
                                <div className="dpd-history-list">
                                    {history.map(h => (
                                        <div
                                            key={h._id}
                                            className={`dpd-history-card ${h._id === appointmentId ? 'current' : ''} ${viewingPastSession && viewingPastSession._id === h._id ? 'viewing-active' : ''}`}
                                            onClick={() => {
                                                if (h._id === appointmentId) setViewingPastSession(null);
                                                else setViewingPastSession(viewingPastSession && viewingPastSession._id === h._id ? null : h);
                                            }}
                                            style={{ cursor: 'pointer', transition: 'all 0.2s', border: viewingPastSession && viewingPastSession._id === h._id ? '2px solid #3b82f6' : '' }}
                                        >
                                            {viewingPastSession && viewingPastSession._id === h._id && (
                                                <div style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', fontSize: '11px', borderRadius: '4px', display: 'inline-block', marginBottom: '8px', fontWeight: 'bold' }}>
                                                    👁️ Viewing Right Now
                                                </div>
                                            )}
                                            <div className="dpd-hist-top">
                                                <span className="dpd-hist-date">
                                                    {new Date(h.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                </span>
                                                <span className={`dpd-hist-status status-${h.status}`}>{h.status}</span>
                                            </div>
                                            <div className="dpd-hist-diagnosis">
                                                <strong>Diagnosis:</strong> {h.diagnosis || 'No diagnosis recorded'}
                                            </div>
                                            {h.doctorNotes && (
                                                <div className="dpd-hist-notes">
                                                    <strong>Notes:</strong> {h.doctorNotes}
                                                </div>
                                            )}
                                            {h.serviceName && (
                                                <span className="dpd-hist-service">{h.serviceName}</span>
                                            )}
                                            {h.prescriptions && h.prescriptions.filter(p => p.type === 'lab_report').map((file, idx) => (
                                                <div key={idx} className="dpd-hist-file">
                                                    🧪 <a href={file.url} target="_blank" rel="noopener noreferrer">View Lab Report</a>
                                                </div>
                                            ))}
                                            {h._id === appointmentId && <span className="dpd-current-badge">📌 Current Session</span>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* DYNAMIC FORMS RENDERER */}
                    {dynamicTabs.map(dTab => (
                        activeTab === dTab.id && (
                            <div key={dTab.id} style={{ display: 'block' }}>
                                <DynamicQuestionForm
                                    categoryName={dTab.label}
                                    questions={dTab.data}
                                    intakeData={intakeData}
                                    setIntakeData={setIntakeData}
                                />
                                <button className="dpd-save-section" onClick={handleSaveProfile} disabled={saving} style={{ marginTop: '20px' }}>
                                    {saving ? 'Saving...' : `💾 Save ${dTab.label} Data`}
                                </button>
                            </div>
                        )
                    ))}
                </div>
            </div>

            {/* RIGHT PANEL - SESSION NOTEPAD */}
            <div className={`dpd-right ${viewingPastSession ? 'time-machine-active' : ''}`} style={viewingPastSession ? { background: '#f8fafc', borderLeft: '4px solid #3b82f6' } : {}}>
                {viewingPastSession ? (
                    <>
                        <div className="dpd-right-header" style={{ background: '#eff6ff', borderBottom: '1px solid #bfdbfe' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <h2 style={{ color: '#1e3a8a' }}>🕰️ Past Session</h2>
                                    <span style={{ fontSize: '12px', background: '#dbeafe', color: '#1e40af', padding: '2px 8px', borderRadius: '12px', fontWeight: 'bold' }}>Read-only</span>
                                </div>
                                <p className="dpd-right-subtitle" style={{ color: '#3b82f6', fontWeight: 600 }}>
                                    Viewing notes from {new Date(viewingPastSession.appointmentDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                            <button
                                onClick={() => setViewingPastSession(null)}
                                style={{ padding: '6px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                ✕ Exit Time Machine
                            </button>
                        </div>

                        <div className="dpd-right-content">
                            <div className="dpd-session-field">
                                <label>🔍 Diagnosis at the time</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155' }}>
                                    {viewingPastSession.diagnosis || <em style={{ color: '#94a3b8' }}>No diagnosis recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>📋 Clinical Notes</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155', minHeight: '80px', whiteSpace: 'pre-wrap' }}>
                                    {viewingPastSession.doctorNotes || <em style={{ color: '#94a3b8' }}>No notes recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>💊 Prescription Given</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155', minHeight: '60px' }}>
                                    {viewingPastSession.pharmacy?.length > 0 ? (
                                        <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                            {viewingPastSession.pharmacy.map((p, i) => (
                                                <li key={i}><strong>{p.medicineName}</strong></li>
                                            ))}
                                        </ul>
                                    ) : <em style={{ color: '#94a3b8' }}>No prescription recorded</em>}
                                </div>
                            </div>

                            <div className="dpd-session-field">
                                <label>🧪 Lab Tests Ordered</label>
                                <div style={{ padding: '12px', background: 'rgba(255,255,255,0.7)', border: '1px dashed #cbd5e1', borderRadius: '8px', color: '#334155' }}>
                                    {(viewingPastSession.labTests || []).length > 0
                                        ? (viewingPastSession.labTests || []).join(', ')
                                        : <em style={{ color: '#94a3b8' }}>No lab tests ordered</em>}
                                </div>
                            </div>
                        </div>

                        <div className="dpd-right-footer" style={{ background: '#f1f5f9' }}>
                            <button
                                onClick={() => {
                                    setSessionData({
                                        diagnosis: viewingPastSession.diagnosis || '',
                                        notes: viewingPastSession.doctorNotes || '',
                                        prescription: viewingPastSession.pharmacy?.map(p => p.medicineName).join('\n') || '',
                                        labTests: (viewingPastSession.labTests || []).join(', ')
                                    });
                                    setViewingPastSession(null);
                                    alert("Historical data copied into your Current Session editor!");
                                }}
                                style={{ padding: '10px 18px', background: 'transparent', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                            >
                                📋 Copy to Current Session
                            </button>
                            <button className="dpd-btn-finish" onClick={() => setViewingPastSession(null)} style={{ background: '#64748b' }}>
                                Return to Current Editing
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="dpd-right-header">
                            <div>
                                <h2>📝 Current Session</h2>
                                <p className="dpd-right-subtitle">Record diagnosis, notes & prescription</p>
                            </div>
                            <span className={`dpd-session-status status-${appointment.status}`}>
                                {appointment.status}
                            </span>
                        </div>

                        <div className="dpd-right-content">
                            <div className="dpd-session-field">
                                <label>🔍 Diagnosis</label>
                                <input
                                    name="diagnosis"
                                    value={sessionData.diagnosis}
                                    onChange={handleSessionChange}
                                    placeholder="Enter diagnosis..."
                                    className="dpd-diag-input"
                                />
                            </div>

                            <div className="dpd-session-field dpd-notes-field">
                                <label>📋 Clinical Notes</label>
                                <textarea
                                    name="notes"
                                    value={sessionData.notes}
                                    onChange={handleSessionChange}
                                    placeholder="Write detailed clinical notes, observations, examination findings..."
                                    className="dpd-notes-textarea"
                                />
                            </div>

                            <div className="dpd-session-field">
                                <button
                                    type="button"
                                    onClick={() => setShowPrescribeModal(true)}
                                    style={{ padding: '14px', fontSize: '15px', background: 'linear-gradient(135deg, #4f46e5, #6366f1)', color: 'white', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(79, 70, 229, 0.25)', marginTop: '10px' }}
                                >
                                    💊 / 🧪 Prescribe Medicines & Lab Tests
                                </button>

                                {(sessionData.prescription || sessionData.labTests) && (
                                    <div style={{ padding: '12px', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0', marginTop: '10px', fontSize: '13px', color: '#475569' }}>
                                        {sessionData.prescription && <div style={{ marginBottom: '4px' }}><b>✅ Medicines included</b></div>}
                                        {sessionData.labTests && <div><b>✅ Lab Tests included</b></div>}
                                        <div style={{ marginTop: '8px', fontSize: '12px', color: '#3b82f6', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => setShowPrescribeModal(true)}>
                                            Click above button to view/edit details.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="dpd-right-footer">
                            <button className="dpd-btn-save-draft" onClick={handleSaveProfile} disabled={saving}>
                                💾 Save Profile
                            </button>
                            <button className="dpd-btn-finish" onClick={handleSaveAndMerge} disabled={saving}>
                                {saving ? '⏳ Processing...' : '✅ Complete Session & Generate Report'}
                            </button>
                        </div>
                    </>
                )}
            </div>

            {/* ====== MODALS ====== */}
            {showPrescribeModal && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#fff', padding: '24px', borderRadius: '16px', width: '850px', maxWidth: '95vw', height: '85vh', maxHeight: '850px', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', paddingBottom: '16px', borderBottom: '1px solid #e2e8f0' }}>
                            <h3 style={{ margin: 0, color: '#0f172a', fontSize: '1.4rem', fontWeight: '800' }}>⚕️ Prescribe Medicines & Lab Tests</h3>
                            <button onClick={() => setShowPrescribeModal(false)} style={{ background: '#f1f5f9', border: 'none', width: '32px', height: '32px', borderRadius: '50%', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569' }}>✕</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '30px', paddingRight: '8px' }}>

                            {/* Medicines Section */}
                            <div>
                                <h4 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>💊 Select Medicines</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                                    {catalogMedicines.length > 0 ? catalogMedicines.map(med => {
                                        const isIncluded = sessionData.prescription.includes(med.name);
                                        return (
                                            <label key={med._id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', cursor: 'pointer', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: isIncluded ? '#eff6ff' : '#fafafa', borderColor: isIncluded ? '#93c5fd' : '#e2e8f0', transition: 'all 0.2s' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isIncluded}
                                                    onChange={(e) => {
                                                        let lines = sessionData.prescription.split('\n').filter(l => l.trim() !== '');
                                                        if (e.target.checked) {
                                                            if (!isIncluded) lines.push(`${med.name} - 1 OD`);
                                                        } else {
                                                            lines = lines.filter(l => !l.startsWith(med.name));
                                                        }
                                                        setSessionData(prev => ({ ...prev, prescription: lines.join('\n') }));
                                                    }}
                                                    style={{ marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px' }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: '700', color: '#0f172a' }}>{med.name}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{med.genericName}</div>
                                                </div>
                                            </label>
                                        );
                                    }) : <p style={{ color: '#94a3b8', fontSize: '13px', gridColumn: '1 / -1', textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '8px' }}>No medicines catalog defined by Super Admin.</p>}
                                </div>
                                <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Edit Final Prescription (Manual entry allowed):</label>
                                <textarea
                                    name="prescription"
                                    value={sessionData.prescription}
                                    onChange={handleSessionChange}
                                    placeholder={"Tab. Folic Acid 5mg - 1 OD\nTab. Progesterone 200mg - 1 BD"}
                                    className="dpd-prescription-textarea"
                                    style={{ minHeight: '100px', width: '100%', boxSizing: 'border-box', background: '#fefce8', borderColor: '#fde68a' }}
                                />
                            </div>

                            <hr style={{ border: 'none', borderTop: '2px dashed #e2e8f0', margin: '0' }} />

                            {/* Lab Tests Section */}
                            <div>
                                <h4 style={{ margin: '0 0 12px', color: '#1e293b', fontSize: '1.1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>🧪 Select Lab Tests</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '10px', marginBottom: '16px' }}>
                                    {catalogTests.length > 0 ? catalogTests.filter(t => t.isActive).map(test => {
                                        const isChecked = sessionData.labTests.split(', ').includes(test.name);
                                        return (
                                            <label key={test._id} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '13px', cursor: 'pointer', padding: '12px', border: '1px solid #e2e8f0', borderRadius: '10px', background: isChecked ? '#eff6ff' : '#fafafa', borderColor: isChecked ? '#93c5fd' : '#e2e8f0', transition: 'all 0.2s' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={isChecked}
                                                    onChange={(e) => {
                                                        let currentTests = sessionData.labTests ? sessionData.labTests.split(', ') : [];
                                                        if (e.target.checked) {
                                                            currentTests.push(test.name);
                                                        } else {
                                                            currentTests = currentTests.filter(t => t !== test.name);
                                                        }
                                                        setSessionData(prev => ({ ...prev, labTests: currentTests.join(', ') }));
                                                    }}
                                                    style={{ marginTop: '2px', cursor: 'pointer', width: '16px', height: '16px' }}
                                                />
                                                <div>
                                                    <div style={{ fontWeight: '700', color: '#0f172a' }}>{test.name}</div>
                                                    <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px' }}>{test.category}</div>
                                                </div>
                                            </label>
                                        );
                                    }) : <p style={{ color: '#94a3b8', fontSize: '13px', gridColumn: '1 / -1', textAlign: 'center', padding: '20px', background: '#f8fafc', borderRadius: '8px' }}>No lab tests defined by Super Admin.</p>}
                                </div>
                                <label style={{ fontSize: '13px', fontWeight: '700', color: '#475569', display: 'block', marginBottom: '6px' }}>Edit Final Lab Tests (Comma separated):</label>
                                <input
                                    name="labTests"
                                    value={sessionData.labTests}
                                    onChange={handleSessionChange}
                                    placeholder="CBC, LFT, KFT..."
                                    className="dpd-diag-input"
                                    style={{ width: '100%', boxSizing: 'border-box' }}
                                />
                            </div>

                        </div>

                        <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                            <button onClick={() => setShowPrescribeModal(false)} style={{ padding: '12px 24px', background: '#f1f5f9', color: '#475569', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }}>Close</button>
                            <button onClick={() => setShowPrescribeModal(false)} style={{ padding: '12px 30px', background: 'linear-gradient(135deg, #3b82f6, #6366f1)', color: '#fff', border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 'bold', fontSize: '15px', boxShadow: '0 4px 6px rgba(59, 130, 246, 0.3)' }}>Save Selections & Resume Note</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default DoctorPatientDetails;