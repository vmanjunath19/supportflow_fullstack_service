class RepositoryError(Exception):
    """Base error for data access failures."""


class TicketNotFoundError(RepositoryError):
    """Raised when a requested ticket ID does not exist."""


class IllegalTransitionError(RepositoryError):
    """Raised when a ticket update violates state machine or business rules."""


class RepositoryValidationError(RepositoryError):
    """Raised when data violates database constraints or foreign keys."""