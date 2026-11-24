import { auth, db } from '../../js/firebase.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { collection, getDocs, doc, getDoc, query, where } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

const $ = id => document.getElementById(id);
const totalCourses = $('totalCourses');
const activeCourses = $('activeCourses');
const completedCourses = $('completedCourses');
const overallProgress = $('overallProgress');
const completedLessons = $('completedLessons');
const certificatesEarned = $('certificatesEarned');
const learningStreak = $('learningStreak');
const courseProgressList = $('courseProgressList');
const progressMessage = $('progressMessage');

onAuthStateChanged(auth, user => {
    if (!user) { window.location.replace('../login.html'); return; }
    loadLearningProgress(user.uid);
});

function refreshIcons() { if (window.lucide?.createIcons) window.lucide.createIcons(); }
function showMessage(message) {
    if (!progressMessage) return;
    const text = progressMessage.querySelector('span');
    if (text) text.textContent = message;
    progressMessage.style.display = 'flex';
}
function hideMessage() { if (progressMessage) progressMessage.style.display = 'none'; }
function clampProgress(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, Math.min(100, Math.round(number))) : 0;
}
function isEligibleEnrollment(data) {
    const status = String(data.status || '').trim().toLowerCase();
    const payment = String(data.paymentStatus || '').trim().toLowerCase();
    if (['revoked', 'suspended', 'cancelled', 'canceled', 'rejected', 'pending'].includes(status)) return false;
    if (data.institutionId && ['active', 'approved', 'completed'].includes(status)) return true;
    if (['active', 'approved', 'completed'].includes(status) && ['paid', 'free'].includes(payment)) return true;
    return status === 'paid' && (!payment || payment === 'paid');
}

async function getEnrollmentRecords(userId) {
    const tasks = [
        getDocs(collection(db, 'students', userId, 'enrollments')),
        getDocs(query(collection(db, 'enrollments'), where('userId', '==', userId))),
        getDocs(query(collection(db, 'enrollments'), where('studentId', '==', userId)))
    ];
    const results = await Promise.allSettled(tasks);
    const successful = results.filter(result => result.status === 'fulfilled');
    if (!successful.length) throw results[0].reason || new Error('Enrollment records are unavailable.');
    const records = new Map();
    for (const result of successful) {
        result.value.forEach(snapshot => {
            const data = snapshot.data() || {};
            const courseId = data.courseId || data.course_id || '';
            if (!courseId || !isEligibleEnrollment(data)) return;
            const key = String(courseId);
            const existing = records.get(key);
            const candidate = { id: snapshot.id, ref: snapshot.ref, courseId: key, data };
            if (!existing || (Array.isArray(data.completedLessons) && data.completedLessons.length > (existing.data.completedLessons || []).length) || clampProgress(data.progress) > clampProgress(existing.data.progress)) {
                records.set(key, candidate);
            }
        });
    }
    return [...records.values()];
}

async function getCourse(courseId) {
    try {
        const snapshot = await getDoc(doc(db, 'courses', courseId));
        return snapshot.exists() ? snapshot.data() || {} : {};
    } catch (error) {
        console.warn('Course details unavailable:', courseId, error);
        return {};
    }
}

async function loadCertificates(userId) {
    try {
        const snapshot = await getDocs(query(collection(db, 'certificates'), where('studentId', '==', userId)));
        if (certificatesEarned) certificatesEarned.textContent = String(snapshot.size);
    } catch (error) {
        console.warn('Certificate count unavailable:', error);
        if (certificatesEarned) certificatesEarned.textContent = '—';
    }
}

async function loadStreak(userId) {
    try {
        const snapshot = await getDoc(doc(db, 'students', userId));
        const streak = snapshot.exists() ? Math.max(0, Number(snapshot.data().streak) || 0) : 0;
        if (learningStreak) learningStreak.textContent = `${streak} ${streak === 1 ? 'day' : 'days'}`;
    } catch (error) {
        console.warn('Learning streak unavailable:', error);
        if (learningStreak) learningStreak.textContent = '—';
    }
}

function renderCourse(record, course) {
    const data = record.data;
    const progress = clampProgress(data.progress);
    const done = Array.isArray(data.completedLessons) ? data.completedLessons : [];
    const totalLessons = Math.max(0, Number(course.totalLessons || course.lessonCount || data.totalLessons || 0));
    const title = course.title || data.courseTitle || data.courseName || 'Course';
    const card = document.createElement('article');
    card.className = 'course-progress-card';
    const top = document.createElement('div');
    top.className = 'course-progress-top';
    const info = document.createElement('div');
    info.className = 'course-progress-info';
    const heading = document.createElement('h3');
    heading.textContent = title;
    const description = document.createElement('p');
    description.textContent = progress >= 100 ? 'Course completed' : 'Continue building your skills';
    info.append(heading, description);
    const percent = document.createElement('span');
    percent.className = 'course-progress-percent';
    percent.textContent = `${progress}%`;
    top.append(info, percent);
    const bar = document.createElement('div');
    bar.className = 'progress-bar';
    bar.setAttribute('role', 'progressbar');
    bar.setAttribute('aria-valuemin', '0');
    bar.setAttribute('aria-valuemax', '100');
    bar.setAttribute('aria-valuenow', String(progress));
    bar.setAttribute('aria-label', `${title} progress`);
    const fill = document.createElement('div');
    fill.className = 'progress-bar-fill';
    fill.style.width = `${progress}%`;
    bar.appendChild(fill);
    const bottom = document.createElement('div');
    bottom.className = 'course-progress-bottom';
    const lessonText = document.createElement('span');
    lessonText.textContent = totalLessons ? `${done.length} of ${totalLessons} lessons completed` : `${done.length} lessons completed`;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'continue-learning-btn';
    button.textContent = progress >= 100 ? 'Review course' : 'Continue learning';
    button.addEventListener('click', () => { window.location.href = `course-player.html?id=${encodeURIComponent(record.courseId)}`; });
    bottom.append(lessonText, button);
    card.append(top, bar, bottom);
    courseProgressList.appendChild(card);
}

async function loadLearningProgress(userId) {
    if (courseProgressList) {
        courseProgressList.innerHTML = `<div class='progress-loading' role='status'><i data-lucide='loader-circle'></i><p>Loading your learning progress…</p></div>`;
    }
    hideMessage();
    try {
        const records = await getEnrollmentRecords(userId);
        const detailed = await Promise.all(records.map(async record => ({ record, course: await getCourse(record.courseId) })));
        if (courseProgressList) courseProgressList.replaceChildren();
        let active = 0;
        let completed = 0;
        let progressTotal = 0;
        let lessonTotal = 0;
        for (const item of detailed) {
            const progress = clampProgress(item.record.data.progress);
            if (progress >= 100 || String(item.record.data.status || '').toLowerCase() === 'completed') completed++;
            else active++;
            progressTotal += progress;
            lessonTotal += Array.isArray(item.record.data.completedLessons) ? new Set(item.record.data.completedLessons).size : 0;
            renderCourse(item.record, item.course);
        }
        if (totalCourses) totalCourses.textContent = String(records.length);
        if (activeCourses) activeCourses.textContent = String(active);
        if (completedCourses) completedCourses.textContent = String(completed);
        if (overallProgress) overallProgress.textContent = records.length ? `${Math.round(progressTotal / records.length)}%` : '0%';
        if (completedLessons) completedLessons.textContent = String(lessonTotal);
        if (!records.length) {
            if (courseProgressList) courseProgressList.innerHTML = `<div class='progress-loading progress-empty'><i data-lucide='book-open'></i><h3>No enrolled courses yet</h3><p>Your course progress will appear here after an enrollment is active.</p><a href='courses.html'>Explore courses</a></div>`;
        }
        await Promise.all([loadCertificates(userId), loadStreak(userId)]);
        if (!records.length) showMessage('No active course enrollments were found.');
        refreshIcons();
    } catch (error) {
        console.error('Learning progress could not be loaded:', error);
        if (courseProgressList) courseProgressList.innerHTML = `<div class='progress-loading progress-error'><i data-lucide='alert-circle'></i><h3>Progress is temporarily unavailable</h3><p>We couldn't retrieve your enrollment records. Check your connection and try again.</p><button type='button' id='retryProgressBtn'>Try again</button></div>`;
        if (totalCourses) totalCourses.textContent = '—';
        if (activeCourses) activeCourses.textContent = '—';
        if (completedCourses) completedCourses.textContent = '—';
        if (overallProgress) overallProgress.textContent = '—';
        if (completedLessons) completedLessons.textContent = '—';
        await Promise.all([loadCertificates(userId), loadStreak(userId)]);
        showMessage('Some learning data could not be loaded.');
        $('retryProgressBtn')?.addEventListener('click', () => loadLearningProgress(userId));
        refreshIcons();
    }
}

