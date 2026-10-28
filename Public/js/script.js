<<<<<<< HEAD
const complaintForm = document.getElementById("complaintForm");

if (complaintForm) {
    complaintForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const formMessage = document.getElementById("formMessage");
        const submitButton = complaintForm.querySelector(
            'button[type="submit"]'
        );

        const complaint = {
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            category: document.getElementById("category").value,
            description: document.getElementById("description").value.trim()
        };

        formMessage.textContent = "Submitting your complaint...";
        submitButton.disabled = true;

        try {
            const response = await fetch("/api/complaints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(complaint)
            });

            const result = await response.json();

           
if (!response.ok) {
    throw new Error(result.message || "Submission failed.");
}

formMessage.innerHTML = `
    <div class="success-panel">
        <div class="success-icon">✓</div>
        <h3>Complaint Submitted Successfully!</h3>
        <p>We're sorry your dining experience wasn't as expected.</p>
        <p>Thank you for giving us a chance to improve.</p>

        <div class="complaint-id-box">
            <span>Your Complaint ID</span>
            <strong id="submittedComplaintId"></strong>
        </div>

        <p class="resolution-note">
            ⏱ Our goal is to resolve your complaint within 24 hours.
        </p>

        <a href="/track-complaint.html" class="btn">
            Track Your Complaint
        </a>
    </div>
`;

document.getElementById("submittedComplaintId").textContent =
    result.complaintId;
            complaintForm.reset();

        } catch (error) {
            console.error("Error:", error);

            formMessage.textContent =
                "Unable to submit complaint. Please try again.";

        } finally {
            submitButton.disabled = false;
        }
    });
=======
const complaintForm = document.getElementById("complaintForm");

if (complaintForm) {
    complaintForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const formMessage = document.getElementById("formMessage");
        const submitButton = complaintForm.querySelector(
            'button[type="submit"]'
        );

        const complaint = {
            name: document.getElementById("name").value.trim(),
            email: document.getElementById("email").value.trim(),
            category: document.getElementById("category").value,
            description: document.getElementById("description").value.trim()
        };

        formMessage.textContent = "Submitting your complaint...";
        submitButton.disabled = true;

        try {
            const response = await fetch("/api/complaints", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(complaint)
            });

            const result = await response.json();

           
if (!response.ok) {
    throw new Error(result.message || "Submission failed.");
}

formMessage.innerHTML = `
    <div class="success-panel">
        <div class="success-icon">✓</div>
        <h3>Complaint Submitted Successfully!</h3>
        <p>We're sorry your dining experience wasn't as expected.</p>
        <p>Thank you for giving us a chance to improve.</p>

        <div class="complaint-id-box">
            <span>Your Complaint ID</span>
            <strong id="submittedComplaintId"></strong>
        </div>

        <p class="resolution-note">
            ⏱ Our goal is to resolve your complaint within 24 hours.
        </p>

        <a href="/track-complaint.html" class="btn">
            Track Your Complaint
        </a>
    </div>
`;

document.getElementById("submittedComplaintId").textContent =
    result.complaintId;
            complaintForm.reset();

        } catch (error) {
            console.error("Error:", error);

            formMessage.textContent =
                "Unable to submit complaint. Please try again.";

        } finally {
            submitButton.disabled = false;
        }
    });
>>>>>>> origin/main
}