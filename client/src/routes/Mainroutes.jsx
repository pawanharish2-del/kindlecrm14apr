import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

// Components
import Navbar from '../components/Navbar';
import Home from '../pages/Home';
import ProtectedRoute from '../components/ProtectedRoute';
import RoleDashboard from '../pages/RoleDashboard';

// User Pages
import Services from '../pages/user/Services';
import Doctors from '../pages/user/Doctors';
import Appointment from '../pages/user/Appointment';
import AppointmentSuccess from '../pages/user/AppointmentSuccess';
import LabReports from '../pages/user/LabReports';
import Dashboard from '../pages/user/Dashboard';
import Pharmacy from '../pages/user/Pharmacy';
import Login from '../pages/user/Login';
import Signup from '../pages/user/Signup';

// Doctor Pages
import Patient from '../pages/doctors/Patient';
import AdminLabTests from '../pages/admin/AdminLabTests';
import DoctorPatientDetails from '../pages/doctors/DoctorPatientDetails';
import UnifiedPatientProfile from '../pages/patient/UnifiedPatientProfile';

// Admin Pages
import Admin from '../pages/admin/Admin';
import AdminDoctors from '../pages/admin/AdminDoctors';
import AdminLabs from '../pages/admin/AdminLabs';
import AdminPharmacy from '../pages/admin/AdminPharmacy';
import AdminReception from '../pages/admin/AdminReception';
import AdminServices from '../pages/admin/AdminServices';
import AdminRoles from '../pages/admin/AdminRoles';
import AdminMainDashboard from '../pages/admin/AdminMainDashboard';
import AdminMedicines from '../pages/admin/AdminMedicines';
import AdminQuestionLibrary from '../pages/admin/AdminQuestionLibrary';
import AdminTestPackages from '../pages/admin/AdminTestPackages';

// Admin Auth
import AdminLogin from '../pages/administration/AdminLogin';
import AdminSignup from '../pages/administration/AdminSignup';
import SuperAdmin from '../pages/administration/SuperAdmin';

// Lab Pages
import LabDashboard from '../pages/lab/LabDashboard';
import AssignedTests from '../pages/lab/AssignedTests';

// Pharmacy Management Pages
import PharmacyInventory from '../pages/pharmacy/PharmacyInventory';
import PharmacyOrders from '../pages/pharmacy/PharmacyOrders';

// Reception Pages
import ReceptionDashboard from '../pages/reception/ReceptionDashboard';

const MainRoutes = () => {
    return (
        <>
            <Navbar />

            <Routes>
                {/* --- Public/User Routes --- */}
                <Route path="/" element={<Home />} />
                <Route path="/services" element={<Services />} />
                <Route path="/doctors" element={<Doctors />} />
                <Route path="/services/:serviceId/doctors" element={<Doctors />} />

                {/* --- Unified Shared Patient Profile --- */}
                <Route path="/patient/:id" element={
                    <ProtectedRoute requiredPermissions={[]}>
                        <UnifiedPatientProfile />
                    </ProtectedRoute>
                } />

                {/* --- Dynamic Role Dashboard (all authenticated users) --- */}
                <Route path="/my-dashboard" element={
                    <ProtectedRoute requiredPermissions={[]}>
                        <RoleDashboard />
                    </ProtectedRoute>
                } />

                <Route path="/appointment" element={<Appointment />} />
                <Route path="/appointment/success" element={<AppointmentSuccess />} />
                <Route path="/lab-reports" element={<LabReports />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/pharmacy" element={<Pharmacy />} />

                {/* --- Authentication --- */}
                <Route path="/login" element={<Login />} />
                <Route path="/signup" element={<Signup />} />

                {/* --- Doctor Routes (permission: visit_diagnose) --- */}
                <Route path="/doctor/dashboard" element={
                    <ProtectedRoute requiredPermissions={['visit_diagnose']}>
                        <Patient />
                    </ProtectedRoute>
                } />
                <Route path="/doctor/patients" element={<Patient />} />
                <Route path="/doctor/patient/:appointmentId" element={
                    <ProtectedRoute requiredPermissions={['visit_diagnose']}>
                        <DoctorPatientDetails />
                    </ProtectedRoute>
                } />

                {/* --- Admin Routes --- */}
                <Route path="/admin" element={
                    <ProtectedRoute requiredPermissions={['admin_view_stats', 'admin_manage_roles']}>
                        <AdminMainDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/admin/users" element={
                    <ProtectedRoute requiredPermissions={['admin_manage_roles']}>
                        <Admin />
                    </ProtectedRoute>
                } />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/admin/signup" element={<AdminSignup />} />

                <Route path="/admin/doctors" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminDoctors /></ProtectedRoute>} />
                <Route path="/admin/labs" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminLabs /></ProtectedRoute>} />
                <Route path="/admin/lab-tests" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminLabTests /></ProtectedRoute>} />
                <Route path="/admin/pharmacy" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminPharmacy /></ProtectedRoute>} />
                <Route path="/admin/reception" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminReception /></ProtectedRoute>} />
                <Route path="/admin/services" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminServices /></ProtectedRoute>} />
                <Route path="/admin/roles" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminRoles /></ProtectedRoute>} />
                <Route path="/admin/medicines" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminMedicines /></ProtectedRoute>} />
                <Route path="/admin/question-library" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminQuestionLibrary /></ProtectedRoute>} />
                <Route path="/admin/test-packages" element={<ProtectedRoute requiredPermissions={['admin_manage_roles']}><AdminTestPackages /></ProtectedRoute>} />

                {/* --- SuperAdmin Routes (Super Admin) --- */}
                <Route path="/superadmin/login" element={<AdminLogin />} />
                <Route path="/superadmin/signup" element={<AdminSignup />} />
                <Route path="/superadmin" element={
                    <ProtectedRoute allowedRoles={['superadmin']}>
                        <SuperAdmin />
                    </ProtectedRoute>
                } />

                {/* --- Lab Routes (permission: lab_view, lab_manage) --- */}
                <Route path="/lab/dashboard" element={
                    <ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}>
                        <LabDashboard />
                    </ProtectedRoute>
                } />
                <Route path="/lab/tests" element={
                    <ProtectedRoute requiredPermissions={['lab_view', 'lab_manage']}>
                        <AssignedTests />
                    </ProtectedRoute>
                } />

                {/* --- Pharmacy Management Routes (permission: pharmacy_view, pharmacy_manage) --- */}
                <Route path="/pharmacy/inventory" element={
                    <ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}>
                        <PharmacyInventory />
                    </ProtectedRoute>
                } />
                <Route path="/pharmacy/orders" element={
                    <ProtectedRoute requiredPermissions={['pharmacy_view', 'pharmacy_manage']}>
                        <PharmacyOrders />
                    </ProtectedRoute>
                } />

                {/* --- Reception Routes (permission: appointment_manage) --- */}
                <Route path="/reception/dashboard" element={
                    <ProtectedRoute requiredPermissions={['appointment_manage']}>
                        <ReceptionDashboard />
                    </ProtectedRoute>
                } />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" />} />
            </Routes>
        </>
    );
};

export default MainRoutes;
