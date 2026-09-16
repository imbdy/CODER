document.addEventListener('DOMContentLoaded', () => {
  const button = document.querySelector('.hero button')
  button.addEventListener('click', (e) => {
    e.preventDefault()
    alert('Subscription request submitted!')
  })
})