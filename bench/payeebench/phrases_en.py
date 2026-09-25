"""English phrase pools (train/test disjoint, validation uses train). Same slots as the Japanese pools."""

ADDRESSEE = {"train": ["Dear Accounts Payable team at {payer},", "Dear {contact},"],
             "test": ["To the finance department, {payer}", "Hello {contact},"]}
OPENER = {"train": ["Thank you for your continued business.", "I hope this message finds you well."],
          "test": ["We appreciate your ongoing partnership.", "Thanks as always for working with us."]}
CLOSING = {"train": ["Thank you for your cooperation.", "We apologise for any inconvenience."],
           "test": ["Many thanks for your understanding.", "We look forward to continuing our work together."]}
SIGNATURE = {"train": ["{sender}\nAccounting Department, {vendor_en}\nTel {tel}", "Best regards,\n{sender} | {vendor_en} | Reg. No. {t_number}"],
             "test": ["Kind regards,\n{sender}, Finance, {vendor_en}\n{address}", "-- {sender} ({vendor_en}, {t_number})"]}

CHANGE_SUBJECT = {"train": ["Notice of change of bank account", "Important: updated remittance details from {vendor_en}"],
                  "test": ["Change to our receiving account", "Remittance account update"]}
CHANGE_REASON = {"train": ["Following the consolidation of our bank's branches,", "As part of consolidating our receiving accounts,"],
                 "test": ["Following a review of our main banking relationship,", "As our group is centralising its treasury operations,"]}
CHANGE_EFFECTIVE = {"train": ["payments due on or after {effective} should be made to the new account below.",
                              "we kindly ask you to use the new account below for payments from {effective}."],
                    "test": ["our receiving account will switch to the one below with effect from {effective}.",
                             "invoices falling due after {effective} should be paid into the new account below."]}
CHANGE_TRANSITION = {"train": ["Payments to the old account will still be accepted until {cutover}."],
                     "test": ["Both accounts remain open until {cutover}, so nothing is lost during the transition."]}
CHANGE_VERIFY = {"train": ["Please feel free to confirm this change by calling our main number on your records ({tel}).",
                           "A signed change-of-account letter will follow by post."],
                   "test": ["The notice is also posted on our website; please verify it using the contact details you already hold.",
                            "Our formal notification letter, bearing the company seal, will reach you by {letter_date}."]}
ACCOUNT_BLOCK = {"train": ["New account: {new}\nPrevious account: {old}"], "test": ["From: {old}\nTo: {new}"]}

FRAUD_SUBJECT = {"train": ["Bank details update", "Updated payment information"], "test": ["New remittance instructions", "Account change request"]}
FRAUD_POLITE = {"train": ["Please note that our bank details have changed. Kindly direct all future payments to the account below.",
                          "We have updated our receiving account. We would be grateful if you could update your records and use the account below from the next payment."],
                "test": ["We are writing to share our new banking information. Please make future remittances to the account shown below.",
                         "Our company has moved to a new account for incoming payments; please amend your vendor file accordingly."]}
FRAUD_REPLY = {"train": ["Please reply to this email once the change has been made."], "test": ["Kindly confirm by return email when your records are updated."]}
FRAUD_URGENT = {"train": ["Our previous account is frozen due to an audit, so the payment must reach the new account below today.",
                          "This is urgent: unless payment is received in the account below by 3 pm today, we will have to suspend shipments."],
                "test": ["Because of a tax review our usual account cannot receive funds. Please switch to the account below immediately.",
                         "Please settle this right away; late payment will incur contractual penalties."]}
FRAUD_SECRECY = {"train": ["Please keep this matter confidential for internal reasons.", "Our phone lines are down, so please do not call; reply by email only."],
                 "test": ["Kindly do not share this with other departments.", "The account manager is travelling, so email is the only way to reach us."]}
PERSONAL_NOTE = {"train": ["Note: the account is held in the name of our accounting officer but is our official receiving account."],
                 "test": ["Note: the account is in our director's personal name."]}
OVERSEAS_NOTE = {"train": ["Note: receipts are now managed through our overseas subsidiary."], "test": ["Note: this is our group's offshore settlement account."]}

REMIND_SUBJECT = {"train": ["Payment reminder: {invoice_no}"], "test": ["Upcoming due date for {invoice_no}"]}
REMIND_GENTLE = {"train": ["This is a friendly reminder that invoice {invoice_no} ({amount}) is due on {due}."],
                 "test": ["Just a note that {invoice_no} for {amount} falls due on {due}."]}
REMIND_SAME_ACCOUNT = {"train": ["Please pay to the account you have on file, as usual."], "test": ["Our bank details are unchanged: {account}."]}
REMIND_SORRY = {"train": ["If you have already paid, please disregard this message."], "test": ["Apologies if our messages crossed."]}
OVERDUE_SUBJECT = {"train": ["Urgent: overdue invoice {invoice_no}"], "test": ["Final notice: {invoice_no} unpaid"]}
OVERDUE = {"train": ["Invoice {invoice_no} ({amount}) was due on {due} and we have not yet received payment. Please arrange payment urgently, by {deadline} at the latest."],
           "test": ["Our records show {invoice_no} ({amount}) remains unpaid since {due}. Please treat this as urgent and pay by {deadline}."]}
OVERDUE_CONSEQUENCE = {"train": ["Late payment interest may be charged if payment is not received by then."],
                       "test": ["If payment is not received by then, we may have to pause further deliveries."]}

CREDIT_SUBJECT = {"train": ["Credit note for returned goods", "Discount applied to {invoice_no}"], "test": ["Corrected invoice amount", "Credit for cancelled items"]}
CREDIT_BODY = {"train": ["We have accepted the return of {qty} units of {item} and are issuing the credit note below.",
                         "As an apology for the short shipment on {invoice_no}, we are granting a discount of {amount}."],
               "test": ["We overcharged {amount} on {invoice_no} due to a unit price error and are correcting it now.",
                        "The cancelled portion of {invoice_no}, {amount}, has been credited to your account."]}
CREDIT_DETAIL = {"train": ["Credit amount {amount} (tax rate {rate}%, consumption tax {tax})"], "test": ["Adjustment: {amount}, of which consumption tax {tax} at {rate}%"]}
CREDIT_SETTLE = {"train": ["The amount will be offset against your next invoice.", "We will refund it to your registered account by {refund_date}."],
                 "test": ["The difference will be deducted from next month's invoice.", "The refund was sent to your nominated account on {refund_date}."]}

EXEC_SUBJECT = {"train": ["Paying {vendor_en} early"], "test": ["{invoice_no} payment date"]}
EXEC_LEGIT = {"train": ["Hi {accountant}, this is {exec}. Could we pay {vendor_en}'s invoice {invoice_no} ({amount}) this week instead of month-end? Their fiscal year closes on Friday. Same account we always use; please run it through the normal approval workflow and I'll approve it there."],
              "test": ["{accountant}, {exec} here. {vendor_en} asked whether {invoice_no} could be paid by {date} rather than at month-end. Keep the bank details on file and raise the usual approval request; I'll sign off today."]}
FAKE_EXEC_SUBJECT = {"train": ["Urgent and confidential", "Wire needed today"], "test": ["Time-sensitive request", "Private: payment today"]}
FAKE_EXEC = {"train": ["{accountant}, I need you to process an urgent wire today for a confidential acquisition. Do not discuss this with anyone until we announce it. I'm in meetings all day and can't take calls, so reply by email only. Amount: {amount}."],
             "test": ["{accountant}, it's {exec}. I'm travelling and our lawyers have cleared a deal that has to close today. Please send {amount} to the account below before the bank cut-off and keep this between the two of us for now."]}

FAKE_EXEC_VENDOR = {"train": ["{accountant}, {exec} here. {vendor_en} told me their bank account has changed. Please pay {invoice_no} ({amount}) to the new account below today. I've already confirmed with them, so there's no need to call."],
                    "test": ["{accountant}, it's {exec}. {vendor_en} switched banks, so {invoice_no} needs to go to the account below today. Skip the vendor-master update for now; I'll sort out the paperwork later."]}

REFUND_SCAM_SUBJECT = {"train": ["Refund of overpayment"], "test": ["Your pending refund"]}
REFUND_SCAM_BODY = {"train": ["Due to a system error you overpaid {amount}. To process your refund, please first transfer a handling fee of {fee} to the account below."],
                    "test": ["A refund of {amount} is on hold for your company. It will be released as soon as the {fee} release fee reaches the account below."]}
REFUND_SCAM_URGENT = {"train": ["If the fee is not received today, the refund will be cancelled."], "test": ["The refund expires tomorrow morning if the fee is not paid."]}
REFUND_SCAM_CALM = {"train": ["The refund will follow within three business days."], "test": ["Refunds are released in the order fees are received."]}

NOTICE = {
    "train": {"relocation": ("Head office relocation", "We are moving our head office on {date}. New address: {new_address}. New phone: {new_tel}. Our bank details are not changing."),
              "receipt": ("Receipt for your payment", "Thank you for your payment of {amount} on {date}. Please find our receipt attached."),
              "contact": ("Change of account manager", "From {date}, {new_person} will take over your account from {old_person}.")},
    "test": {"einvoice": ("Switching to electronic invoices", "From invoices issued on {date} we will send PDF invoices instead of paper. Payment terms and bank details stay the same."),
             "meeting": ("Scheduling our monthly review", "Would {date} in the afternoon work for our monthly review meeting?")},
}
