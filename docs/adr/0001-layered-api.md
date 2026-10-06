# ADR 0001: Layered modular monolith for the API
Status: accepted

One deployable (free-tier hosting, one developer), split into Domain / Application / Infrastructure / Api projects so
the rules are testable without a database and later features (identity, sync, leaderboards) get their own folders per
feature instead of a god class. Microservices were rejected: no scaling need, more cost and operations.
