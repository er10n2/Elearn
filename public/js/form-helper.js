// Simple form submission helper for showing messages inline
function submitFormWithMessage(formElement, redirectUrl) {
    formElement.addEventListener('submit', async function(e) {
        e.preventDefault(); // Stop normal form submission
        
        const messageContainer = document.querySelector('.message-container');
        if (!messageContainer) {
            console.error('Message container not found');
            return;
        }
        
        try {
            // Get form data
            const formData = new FormData(formElement);
            
            // Send data to server
            const response = await fetch(formElement.action, {
                method: 'POST',
                body: formData
            });
            
            // Get the response data
            const data = await response.json();
            
            // Show success message
            if (response.ok) {
                showMessage(messageContainer, data.message, 'success');
                
                // Clear form fields
                formElement.reset();
                
                // Optional: redirect after 2 seconds if redirectUrl is provided
                if (redirectUrl) {
                    setTimeout(() => {
                        window.location.href = redirectUrl;
                    }, 2000);
                }
            } else {
                // Show error message
                showMessage(messageContainer, data.message, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            showMessage(messageContainer, 'Something went wrong. Please try again.', 'error');
        }
    });
}

// Helper function to display messages
function showMessage(container, message, type) {
    // Clear previous messages
    container.innerHTML = '';
    
    // Create message element
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${type}`;
    
    const icon = type === 'success' ? '✓' : '✕';
    messageDiv.innerHTML = `
        <span>${icon}</span>
        <span>${message}</span>
        <span class="close-message" onclick="this.parentElement.style.display='none';">&times;</span>
    `;
    
    container.appendChild(messageDiv);
    
    // Auto-hide error messages after 5 seconds
    if (type === 'error') {
        setTimeout(() => {
            if (messageDiv.parentElement) {
                messageDiv.style.display = 'none';
            }
        }, 5000);
    }
}
