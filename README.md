# AsfST
Abstract Salesforce Syntax Tree — an attempt to provide meaningful execution context to AI for Salesforce development

AsfST is an innovative tool designed to empower AI models in Salesforce development environments. It addresses the limitations of standard AI tools by providing a robust local compilation context derived from Salesforce’s Metadata and Tooling APIs. This enables precise, context-aware code analysis and generation without relying on live deployments.

## Overview

Standard AI development tools often fall short in Salesforce ecosystems due to the absence of a comprehensive Local Compilation Context. AsfST bridges this critical gap by transforming outputs from an Org’s Metadata API and Tooling API into a unified, symbolized Abstract Syntax Tree (AST).

By leveraging Tree-sitter for parsing and a Directed Acyclic Graph (DAG) of dependencies, AsfST empowers AI models to “step through” code with a deep understanding of the underlying schema, field types, and cross-component impacts—all before any deployment takes place. This preemptive analysis reduces errors, accelerates development, and enhances the accuracy of AI-assisted coding in complex Salesforce orgs.

## Key Features

  * **Symbolized Abstraction**: Transforms raw Apex code into a high-level, resolved map of classes and components. Identifiers are pre-linked to their corresponding SObject definitions, ensuring AI models work with semantically rich representations rather than plain text.

  * **Context Radius**: Utilizes the dependency DAG to dynamically scope the “breadth” of context an AI needs for a given task. This minimizes noise and focuses on relevant interconnections, such as how a change in one Apex class affects triggers, Visualforce pages, or Lightning components.

  * **Semantic Diffing**: Integrates with Git for version control and Tree-sitter for AST-based comparisons. Instead of simplistic line-level diffs, it identifies granular changes like “Method X changed its signature” or “Field Y’s data type was altered,” enabling smarter code reviews and merge conflict resolutions.

  * **Pre-Deployment Validation**: Simulates compilation and dependency checks locally, flagging potential issues (e.g., type mismatches or orphaned references) early in the development cycle.

  * **AI Integration Ready**: Outputs in formats compatible with popular LLMs (e.g., JSON-serialized ASTs), making it easy to plug into tools like GitHub Copilot, CodeWhisperer, or custom AI pipelines.

## How It Works

  1. **Metadata Extraction**: AsfST queries the Salesforce Org via Metadata API and Tooling API to fetch components like Apex classes, triggers, objects, and schemas.

  2. **AST Generation**: Using Tree-sitter parsers tailored for Apex and other Salesforce languages, it builds a symbolized AST where symbols are resolved against the org’s metadata (e.g., linking `Account.Name` to its actual field type and permissions).

  3. **Dependency Graphing**: Constructs a DAG to model relationships between components, such as class inheritances, trigger dependencies, or SOQL query impacts.

  4. **Context-Aware Processing**: For AI tasks, AsfST computes a “context radius” based on the query or change set, providing just enough surrounding information to inform decisions without overwhelming the model.

  5. **Diff and Analysis**: When integrated with Git, it performs semantic diffs on AST nodes, highlighting meaningful changes and their ripple effects.

This architecture ensures that AI models operate with the same contextual awareness as a seasoned Salesforce developer, but at machine speed.

## Installation

AsfST is currently in early development. To get started:

### Prerequisites

  * Node.js v16+ (for Tree-sitter integration)

  * Salesforce CLI (sfdx) for API access

  * Git for version control

