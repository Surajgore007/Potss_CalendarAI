// Vanko Web Showcase JavaScript Logic

document.addEventListener('DOMContentLoaded', () => {
  // 1. Google Analytics 4 Event Tracking for Play Store conversions
  function trackPlayStoreClick(locationTag) {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'click_play_store', {
        event_category: 'conversion',
        event_label: locationTag || 'generic',
        transport_type: 'beacon'
      });
    }
  }

  document.querySelectorAll('a[href*="play.google.com"]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const locationTag = btn.getAttribute('data-utm-location') || btn.id || 'button';
      trackPlayStoreClick(locationTag);
    });
  });

  // 2. Mobile Smart App Banner
  const smartBanner = document.getElementById('smartAppBanner');
  const bannerClose = document.getElementById('smartBannerClose');
  const bannerDismissed = localStorage.getItem('vanko_smart_banner_dismissed');

  if (smartBanner && !bannerDismissed && window.innerWidth <= 768) {
    smartBanner.classList.add('visible');
  }

  if (bannerClose && smartBanner) {
    bannerClose.addEventListener('click', () => {
      smartBanner.classList.remove('visible');
      localStorage.setItem('vanko_smart_banner_dismissed', 'true');
    });
  }

  // 3. FAQ Accordion Accessibility & Toggles
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach(item => {
    const btn = item.querySelector('.faq-question');
    if (btn) {
      btn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        
        // Optional: Close others (accordion style)
        faqItems.forEach(other => {
          if (other !== item) {
            other.classList.remove('active');
            const otherBtn = other.querySelector('.faq-question');
            if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
          }
        });

        if (isActive) {
          item.classList.remove('active');
          btn.setAttribute('aria-expanded', 'false');
        } else {
          item.classList.add('active');
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    }
  });

  // 4. Sample Notices for Live AI Demo Simulator (Sanitized, generic campus context)
  const sampleNotices = {
    hackathon: {
      text: `🚀 ANNUAL TECH INNOVATION HACKATHON 2026!\nOrganized by Technical Student Council.\n\nDate: 28th - 29th October 2026\nVenue: Campus Auditorium & Tech Labs (Offline Mode)\nRegistration Deadline: 22nd October 2026, 11:59 PM IST\nPrizes worth ₹50,000 + Internship Opportunities!\nRegister now: https://campus-hackathon.edu/2026`,
      result: {
        title: "Annual Tech Innovation Hackathon",
        type: "Hackathon",
        start: "Oct 28, 2026",
        end: "Oct 29, 2026",
        deadline: "Oct 22, 2026",
        mode: "Offline • Auditorium",
        link: "campus-hackathon.edu/2026",
        reminders: "3 Days, 1 Day & Day-Of Alarms"
      }
    },
    workshop: {
      text: `📢 Hands-on Workshop on Generative AI & Next.js 15\nPresented by Student Council.\nWhen: 25th October 2026 at 3:30 PM\nWhere: Lab 304, IT Department (Hybrid Mode)\nSeats limited to 60 students only. Certificate provided.\nRegister: https://vanko.app/rsvp/genai-workshop`,
      result: {
        title: "Generative AI & Next.js 15 Workshop",
        type: "Workshop",
        start: "Oct 25, 2026 • 3:30 PM",
        end: "Oct 25, 2026 • 6:00 PM",
        deadline: "Oct 24, 2026",
        mode: "Hybrid • Lab 304",
        link: "vanko.app/rsvp/genai-workshop",
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
  const demoIdleState = document.getElementById('demoIdleState');
  const extractedContentWrapper = document.getElementById('extractedContentWrapper');

  // Reset to idle placeholder state (does NOT auto-display card)
  function resetToIdleState() {
    if (demoIdleState) demoIdleState.style.display = 'flex';
    if (extractedContentWrapper) extractedContentWrapper.style.display = 'none';
  }

  // Handle sample pill clicks: ONLY populates textarea, does NOT display card automatically
  samplePills.forEach(pill => {
    pill.addEventListener('click', () => {
      samplePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');

      const sampleKey = pill.getAttribute('data-sample');
      const data = sampleNotices[sampleKey];
      if (data && textarea) {
        textarea.value = data.text;
        resetToIdleState();
      }
    });
  });

  // Reset to idle if user modifies textarea
  if (textarea) {
    textarea.addEventListener('input', () => {
      resetToIdleState();
    });
  }

  // Handle Extract button click: parses and displays card only when clicked
  if (extractBtn) {
    extractBtn.addEventListener('click', () => {
      const activePill = document.querySelector('.sample-pill.active');
      const sampleKey = activePill ? activePill.getAttribute('data-sample') : 'hackathon';
      const textVal = textarea ? textarea.value.trim() : '';

      // Determine result data
      let resultData;
      if (sampleNotices[sampleKey] && textVal === sampleNotices[sampleKey].text.trim()) {
        resultData = sampleNotices[sampleKey].result;
      } else {
        // Smart fallback parser for customized user input
        const lower = textVal.toLowerCase();
        let detectedType = 'Campus Event';
        if (lower.includes('hackathon') || lower.includes('coding')) detectedType = 'Hackathon';
        else if (lower.includes('workshop') || lower.includes('seminar') || lower.includes('hands-on')) detectedType = 'Workshop';
        else if (lower.includes('exam') || lower.includes('submission') || lower.includes('deadline')) detectedType = 'Academic Deadline';

        const lines = textVal.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        let extractedTitle = lines[0] ? lines[0].replace(/[🚀📢⚠️🚨🎯]/g, '').trim() : 'Custom Campus Event';
        if (extractedTitle.length > 45) extractedTitle = extractedTitle.substring(0, 42) + '...';

        resultData = {
          title: extractedTitle,
          type: detectedType,
          start: "Upcoming Scheduled Date",
          deadline: "Registration Deadline Included",
          mode: lower.includes('online') ? 'Online Session' : 'Campus / Department Lab',
          link: "Extracted from notice",
          reminders: "3 Days, 24 Hours & Day-Of Alarms"
        };
      }

      // Visual feedback: parsing animation on the button
      const originalBtnHTML = extractBtn.innerHTML;
      extractBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 0.8s linear infinite;">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
          <path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
        Parsing Notice...
      `;
      extractBtn.style.pointerEvents = 'none';

      setTimeout(() => {
        if (resTitle) resTitle.textContent = resultData.title;
        if (resType) resType.textContent = resultData.type;
        if (resStart) resStart.textContent = resultData.start;
        if (resDeadline) resDeadline.textContent = resultData.deadline;
        if (resMode) resMode.textContent = resultData.mode;
        if (resReminders) resReminders.textContent = resultData.reminders;

        // Reveal card and hide idle state
        if (demoIdleState) demoIdleState.style.display = 'none';
        if (extractedContentWrapper) extractedContentWrapper.style.display = 'flex';

        // Restore button state
        extractBtn.innerHTML = originalBtnHTML;
        extractBtn.style.pointerEvents = 'auto';
      }, 300);
    });
  }

  // 5. Mobile Deep-linking Detection
  const isAndroid = /Android/i.test(navigator.userAgent);
  const playStoreButtons = document.querySelectorAll('.btn-playstore');
  
  if (isAndroid) {
    playStoreButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        // Fall back to web URL if market intent fails
        setTimeout(() => {
          window.location.href = btn.getAttribute('href');
        }, 500);
      });
    });
  }

  // 6. Smooth scroll for anchor links (works with both #hash and /#hash on homepage)
  document.querySelectorAll('a[href^="#"], a[href^="/#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      const hashIndex = href.indexOf('#');
      if (hashIndex !== -1) {
        const targetId = href.substring(hashIndex);
        const isHomePage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html') || window.location.pathname === '';
        if (targetId && targetId !== '#' && isHomePage) {
          const targetElement = document.querySelector(targetId);
          if (targetElement) {
            e.preventDefault();
            targetElement.scrollIntoView({
              behavior: 'smooth',
              block: 'start'
            });
            if (history.pushState) {
              history.pushState(null, null, targetId);
            }
          }
        }
      }
    });
  });

  // 7. Mobile Navigation Drawer Toggle
  const hamburger = document.getElementById('navHamburger');
  const mobileDrawer = document.getElementById('mobileNavDrawer');

  if (hamburger && mobileDrawer) {
    function openDrawer() {
      mobileDrawer.classList.add('open');
      mobileDrawer.setAttribute('aria-hidden', 'false');
      hamburger.classList.add('active');
      hamburger.setAttribute('aria-expanded', 'true');
    }

    function closeDrawer() {
      mobileDrawer.classList.remove('open');
      mobileDrawer.setAttribute('aria-hidden', 'true');
      hamburger.classList.remove('active');
      hamburger.setAttribute('aria-expanded', 'false');
    }

    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = mobileDrawer.classList.contains('open');
      if (isOpen) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });

    // Close when tapping any link inside the mobile drawer
    mobileDrawer.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        closeDrawer();
      });
    });

    // Close when clicking outside the navbar
    document.addEventListener('click', (e) => {
      if (!mobileDrawer.contains(e.target) && !hamburger.contains(e.target)) {
        closeDrawer();
      }
    });
  }
});
