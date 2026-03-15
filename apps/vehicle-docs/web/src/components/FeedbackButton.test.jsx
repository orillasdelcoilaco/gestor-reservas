import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import FeedbackButton from './FeedbackButton'

vi.mock('axios', () => ({
    default: { post: vi.fn() },
}))

import axios from 'axios'

beforeEach(() => vi.clearAllMocks())

// Helpers
const trigger = () => screen.getByTestId('feedback-trigger')
const overlay = () => screen.queryByTestId('feedback-overlay')
const submitBtn = () => screen.getByTestId('feedback-submit')
const textarea = () => screen.getByRole('textbox', { name: /mensaje/i })

async function openModal() {
    render(<FeedbackButton />)
    await userEvent.click(trigger())
}

async function openAndFill(message = 'Muy buen servicio') {
    await openModal()
    await userEvent.type(textarea(), message)
}

describe('FeedbackButton', () => {
    describe('trigger button', () => {
        it('renders the floating trigger button', () => {
            render(<FeedbackButton />)
            expect(trigger()).toBeInTheDocument()
        })

        it('does not show the modal initially', () => {
            render(<FeedbackButton />)
            expect(overlay()).not.toBeInTheDocument()
        })

        it('opens the modal when the trigger is clicked', async () => {
            await openModal()
            expect(overlay()).toBeInTheDocument()
            expect(screen.getByRole('heading', { name: /enviar comentarios/i })).toBeInTheDocument()
        })
    })

    describe('modal interaction', () => {
        it('shows all four category options', async () => {
            await openModal()
            for (const cat of ['Sugerencia', 'Error', 'Pregunta', 'Otro']) {
                expect(screen.getByRole('button', { name: cat })).toBeInTheDocument()
            }
        })

        it('highlights the selected category', async () => {
            await openModal()
            const errorBtn = screen.getByRole('button', { name: 'Error' })
            await userEvent.click(errorBtn)
            expect(errorBtn).toHaveClass('bg-indigo-600')
            expect(screen.getByRole('button', { name: 'Sugerencia' })).not.toHaveClass('bg-indigo-600')
        })

        it('disables the submit button when message is empty', async () => {
            await openModal()
            expect(submitBtn()).toBeDisabled()
        })

        it('enables the submit button when message has content', async () => {
            await openAndFill('Hola mundo')
            expect(submitBtn()).toBeEnabled()
        })

        it('closes the modal when the close (X) button is clicked', async () => {
            await openModal()
            await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
            expect(overlay()).not.toBeInTheDocument()
        })

        it('closes the modal when clicking the backdrop', async () => {
            await openModal()
            fireEvent.click(overlay())
            expect(overlay()).not.toBeInTheDocument()
        })
    })

    describe('form submission', () => {
        it('calls POST /api/feedback with the selected category and message', async () => {
            axios.post.mockResolvedValueOnce({ data: { success: true } })
            await openAndFill('Excelente app')
            await userEvent.click(screen.getByRole('button', { name: 'Error' }))
            await userEvent.click(submitBtn())

            await waitFor(() => {
                expect(axios.post).toHaveBeenCalledWith(
                    '/api/feedback',
                    { category: 'Error', message: 'Excelente app' },
                    expect.objectContaining({ headers: expect.any(Object) })
                )
            })
        })

        it('shows success state after a successful submission', async () => {
            axios.post.mockResolvedValueOnce({ data: { success: true } })
            await openAndFill('Todo bien')
            await userEvent.click(submitBtn())

            await waitFor(() =>
                expect(screen.getByTestId('feedback-success')).toBeInTheDocument()
            )
            expect(screen.getByText(/gracias por tu opinión/i)).toBeInTheDocument()
        })

        it('shows an error message when the request fails', async () => {
            axios.post.mockRejectedValueOnce({
                response: { data: { error: 'Error del servidor' } },
                message: 'Request failed',
            })
            await openAndFill('Algo está roto')
            await userEvent.click(submitBtn())

            await waitFor(() =>
                expect(screen.getByTestId('feedback-error')).toBeInTheDocument()
            )
            expect(screen.getByText('Error del servidor')).toBeInTheDocument()
        })

        it('defaults to a generic error when response has no error field', async () => {
            axios.post.mockRejectedValueOnce({ message: 'Network Error' })
            await openAndFill('Test')
            await userEvent.click(submitBtn())

            await waitFor(() =>
                expect(screen.getByTestId('feedback-error')).toBeInTheDocument()
            )
        })

        it('resets the form state when reopened after a successful submission', async () => {
            axios.post.mockResolvedValueOnce({ data: { success: true } })
            await openAndFill('Genial')
            await userEvent.click(submitBtn())
            await waitFor(() => screen.getByTestId('feedback-success'))

            await userEvent.click(screen.getByTestId('feedback-close-success'))
            await userEvent.click(trigger())

            expect(textarea()).toHaveValue('')
            expect(screen.queryByTestId('feedback-success')).not.toBeInTheDocument()
        })
    })
})
