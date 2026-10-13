// Vanko Web Showcase JavaScript Logic

document.addEventListener('DOMContentLoaded', () => {
  // 1. Sample Notices for Live AI Demo Simulator
  const sampleNotices = {
    hackathon: {
      text: `🚀 SIES GST TECH INNOVATION HACKATHON 2026!\nOrganized by CSI & IEEE Student Branch.\n\nDate: 28th - 29th October 2026\nVenue: College Auditorium & Tech Labs (Offline Mode)\nRegistration Deadline: 22nd October 2026, 11:59 PM IST\nPrizes worth ₹50,000 + Internship Opportunities!\nRegister now: https://siesgst.edu.in/hackathon2026`,
      result: {
        title: "SIES GST Tech Innovation Hackathon",
        type: "Hackathon",
        start: "Oct 28, 2026",
        end: "Oct 29, 2026",
        deadline: "Oct 22, 2026",
        mode: "Offline • Auditorium",
        link: "siesgst.edu.in/hackathon2026",
        reminders: "3 Days, 1 Day & Day-Of Alarms"
      }
    },
    workshop: {
      text: `📢 Hands-on Workshop on Generative AI & Next.js 15\nPresented by Student Council.\nWhen: 25th October 2026 at 3:30 PM\nWhere: Lab 304, IT Department (Hybrid Mode)\nSeats limited to 60 students only. Certificate provided.\nRegister: https://vanko.app/rsvp/genai-sies`,
      result: {
        title: "Generative AI & Next.js 15 Workshop",
        type: "Workshop",
        start: "Oct 25, 2026 • 3:30 PM",
        end: "Oct 25, 2026 • 6:00 PM",
        deadline: "Oct 24, 2026",
        mode: "Hybrid • Lab 304",
        link: "vanko.app/rsvp/genai-sies",
        reminders: "1 Day & 2 Hours Prior Alarms"
      }
    },
    deadline: {
      text: `⚠️ URGENT NOTICE: Final Year Capstone Project Synopsis Submission\nAll B.Tech students must upload signed synopsis PDF on portal.\nFinal Hard Cutoff: 30th October 2026 before 5:00 PM Sharp.\nNo late extensions will be entertained.`,
      result: {
        title: "Capstone Project Synopsis Submission",
        type: "Academic Deadline",
        start: "Oct 30, 2026 • 5:00 PM",
        end: "Oct 30, 2026",
        deadline: "Oct 30, 2026 (Hard Cutoff)",
        mode: "Online Portal Submission",
        link: "college-portal.edu/submit",
        reminders: "2 Days & 6 Hours Alarms"
      }
    }
  };

  const textarea = document.getElementById('demoInput');
  const extractBtn = document.getElementById('btnExtract');
  const samplePills = document.querySelectorAll('.sample-pill');
  
  // Output card elements
  const resTitle = document.getElementById('resTitle');
  const resType = document.getElementById('resType');
  const resStart = document.getElementById('resStart');
  const resDeadline = document.getElementById('resDeadline');
  const resMode = document.getElementById('resMode');
  const resReminders = document.getElementById('resReminders');
  const resCard = document.getElementById('extractedResultCard');

  // Handle sample pill clicks
  samplePills.forEach(pill => {
    pill.addEventListener('click', () => {
      samplePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const sampleKey = pill.getAttribute('data-sample');
      const data = sampleNotices[sampleKey];
      if (data) {
        textarea.value = data.text;
        triggerExtraction(data.result);
      }
    });
  });

  // Handle Extract button click
  if (extractBtn) {
    extractBtn.addEventListener('click', () => {
      const activePill = document.querySelector('.sample-pill.active');
      const sampleKey = activePill ? activePill.getAttribute('data-sample') : 'hackathon';
      const data = sampleNotices[sampleKey] || sampleNotices.hackathon;
      triggerExtraction(data.result);
    });
  }

  function triggerExtraction(result) {
    if (!resCard) return;
    
    // Smooth transition
    resCard.style.opacity = '0.4';
    resCard.style.transform = 'scale(0.98)';

    setTimeout(() => {
      resTitle.textContent = result.title;
      resType.textContent = result.type;
      resStart.textContent = result.start;
      resDeadline.textContent = result.deadline;
      resMode.textContent = result.mode;
      resReminders.textContent = result.reminders;

      resCard.style.opacity = '1';
      resCard.style.transform = 'scale(1)';
    }, 250);
  }

  // 2. Mobile Deep-linking Detection
  // If user is browsing on Android, allow direct market:// intent
  const isAndroid = /Android/i.test(navigator.userAgent);
  const playStoreButtons = document.querySelectorAll('.btn-playstore');
  
  if (isAndroid) {
    playStoreButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Fall back to web URL if market intent fails
        setTimeout(() => {
          window.location.href = 'https://play.google.com/store/apps/details?id=com.suraj.eventpulse';
        }, 500);
      });
    });
  }

  // 3. Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId && targetId !== '#') {
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
          e.preventDefault();
          targetElement.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    });
  });
});
